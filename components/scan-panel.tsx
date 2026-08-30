"use client"

import { useEffect, useState } from "react"
import { ArrowUpRight, ExternalLink, Loader2, Search } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api, ApiClientError } from "@/lib/api-client"
import { useRouter } from "next/navigation"
import type { ScanFinding, ScanRepo, ScanView } from "@/lib/db"

const POLL_MS = 2000
const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const

type ScanTarget = {
  installationId: number
  account: string
  accountType: "User" | "Organization"
  repos: string[]
}

const ALL_REPOS = ""
/** Empty means "whatever GitHub says the default is", resolved server-side. */
const DEFAULT_BRANCH = ""
// Radix Select refuses an empty item value, so the two "no choice" options need
// a name of their own on the way in and out.
const ALL_REPOS_VALUE = "__all__"
const DEFAULT_BRANCH_VALUE = "__default__"

/**
 * The scan picker. There is deliberately no text field: a box the reader types a
 * repository into makes *us* decide what they may read, and we are not the ones
 * who know. Everything offered here came back from GitHub for this user's own
 * token, so the list is the answer rather than a filter over one.
 */
export function ScanPicker({
  installUrl,
  initialAccount,
  initialRepo,
  onStarted,
}: {
  installUrl: string | null
  /** From a /scan/owner[/repo] deep link. An opening selection, never a grant. */
  initialAccount?: string
  initialRepo?: string | null
  /** Lets a dialog close itself once the scan is on its way. */
  onStarted?: () => void
}) {
  const [targets, setTargets] = useState<ScanTarget[] | null>(null)
  const [account, setAccount] = useState("")
  const [repo, setRepo] = useState(ALL_REPOS)
  const [branch, setBranch] = useState(DEFAULT_BRANCH)
  const [branches, setBranches] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    api<ScanTarget[]>("/api/scan-targets")
      .then((loaded) => {
        setTargets(loaded)
        // A deep link opens on what it named, but only if GitHub listed it for
        // this user. Anything else falls back to the first account they have,
        // and the callout below explains why.
        const wanted = loaded.find((target) => target.account === initialAccount)
        setAccount(wanted?.account ?? loaded[0]?.account ?? "")
        if (wanted && initialRepo && wanted.repos.includes(initialRepo)) setRepo(initialRepo)
      })
      .catch((cause) =>
        setError(cause instanceof ApiClientError ? cause.message : "Could not load your repositories."),
      )
  }, [initialAccount, initialRepo])

  const selected = targets?.find((target) => target.account === account)

  // One repository's branches never apply to another, so the two move together.
  function selectRepo(next: string) {
    setRepo(next)
    setBranch(DEFAULT_BRANCH)
    setBranches(null)
  }

  // Fetch only. Clearing the previous repository's branches belongs in the
  // handler that changed the repository, doing it here would set state during
  // render and cascade.
  useEffect(() => {
    if (repo === ALL_REPOS || !selected) return
    let current = true
    api<{ branches: string[]; defaultBranch: string }>(
      `/api/scan-branches?installationId=${selected.installationId}&repo=${encodeURIComponent(repo)}`,
    )
      .then((loaded) => current && setBranches(loaded.branches))
      // A branch list that will not load is not worth blocking a scan over: the
      // server falls back to the default branch when none is sent.
      .catch(() => current && setBranches([]))
    return () => {
      current = false
    }
  }, [repo, selected])
  // The link named something GitHub did not list for this user: either the app
  // is not installed there, or they cannot read it. Both end at the same button.
  const missingTarget =
    targets !== null &&
    targets.length > 0 &&
    ((initialAccount !== undefined && !targets.some((t) => t.account === initialAccount)) ||
      (initialRepo != null &&
        !targets.some((t) => t.account === initialAccount && t.repos.includes(initialRepo))))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy || !selected) return
    setBusy(true)
    setError(null)
    try {
      // A scan of twenty repositories is a page, not a panel. Hand off to it
      // rather than growing the form into a report.
      const scan = await api<ScanView>("/api/scans", {
          method: "POST",
        body: {
          installationId: selected.installationId,
          ...(repo === ALL_REPOS ? {} : { repo }),
          ...(repo !== ALL_REPOS && branch !== DEFAULT_BRANCH ? { branch } : {}),
        },
      })
      onStarted?.()
      router.push(`/dashboard/scans/${scan.id}`)
    } catch (cause) {
      setError(cause instanceof ApiClientError ? cause.message : "Could not start the scan.")
    } finally {
      setBusy(false)
    }
  }

  if (targets === null && !error) {
    return <p className="text-sm text-[var(--ink-soft)]">Loading your repositories…</p>
  }

  // No installations means nothing to pick, and the only useful next step is
  // installing. So that is the whole of the empty state.
  if (targets?.length === 0) {
    return (
      <InstallCallout
        title="Pushguard is not installed anywhere you can see."
        message="Install it on an account or organization, then come back and pick a repository."
        installUrl={installUrl}
      />
    )
  }

  return (
    <div className="space-y-5">
      {missingTarget && (
        <InstallCallout
          title={`GitHub did not list ${initialRepo ?? initialAccount} for you.`}
          message="Either Pushguard is not installed there, or your account cannot read it. Installing it on that account is the only thing that changes either."
          installUrl={
            installUrl && initialAccount
              ? `/api/scan-intent?target=${encodeURIComponent(initialRepo ?? initialAccount)}&install=1`
              : installUrl
          }
        />
      )}

      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex-1 space-y-1.5">
          <span className="eyebrow">Account</span>
          <Select
            value={account}
            onValueChange={(value) => {
              setAccount(value)
              selectRepo(ALL_REPOS)
            }}
          >
            <SelectTrigger className="mono h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {targets?.map((target) => (
                <SelectItem key={target.installationId} value={target.account}>
                  {target.account}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex-1 space-y-1.5">
          <span className="eyebrow">Repository</span>
          <Select value={repo || ALL_REPOS_VALUE} onValueChange={(value) => selectRepo(value === ALL_REPOS_VALUE ? ALL_REPOS : value)}>
            <SelectTrigger className="mono h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_REPOS_VALUE}>
                Everything I can read ({selected?.repos.length ?? 0})
              </SelectItem>
              {selected?.repos.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        {repo !== ALL_REPOS && (
          <label className="flex-1 space-y-1.5">
            <span className="eyebrow">Branch</span>
            <Select
              value={branch || DEFAULT_BRANCH_VALUE}
              onValueChange={(value) => setBranch(value === DEFAULT_BRANCH_VALUE ? DEFAULT_BRANCH : value)}
              disabled={branches === null}
            >
              <SelectTrigger className="mono h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_BRANCH_VALUE}>
                  {branches === null ? "Loading branches…" : "Default branch"}
                </SelectItem>
                {branches?.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}

        <Button type="submit" size="lg" disabled={busy || !selected} className="h-11 shrink-0">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Scan
        </Button>
      </form>

      {error && (
        <p className="rounded-lg border border-[var(--flag)]/30 bg-[var(--flag-wash)] px-4 py-3 text-sm text-[var(--flag)]">
          {error}
        </p>
      )}

    </div>
  )
}

export function ScanReport({ initial, installUrl }: { initial: ScanView; installUrl: string | null }) {
  const [scan, setScan] = useState(initial)
  // The repo currently being filed, or "*" for everything left.
  const [filing, setFiling] = useState<string | null>(null)
  const [failures, setFailures] = useState<Record<string, string>>({})
  const pending = scan.status === "queued" || scan.status === "running"

  useEffect(() => {
    if (!pending) return
    const timer = setInterval(async () => {
      try {
        setScan(await api<ScanView>(`/api/scans/${scan.id}`))
      } catch {
        // A transient poll failure is not a scan failure; the next tick retries.
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [pending, scan.id])

  async function file(repos?: string[]) {
    setFiling(repos?.[0] ?? "*")
    try {
      const result = await api<{ filed: ScanView["filed"]; failed: { repo: string; reason: string }[] }>(
        `/api/scans/${scan.id}/file`,
        { method: "POST", body: repos ? { repos } : {} },
      )
      // Merge rather than replace: a partial success must not erase what was
      // filed on an earlier attempt.
      const merged = [...scan.filed]
      for (const entry of result.filed) {
        if (!merged.some((existing) => existing.repo === entry.repo)) merged.push(entry)
      }
      setScan({ ...scan, filed: merged })
      setFailures(Object.fromEntries(result.failed.map((f) => [f.repo, f.reason])))

      if (result.filed.length > 0) {
        toast.success(`Reported ${result.filed.length} issue${result.filed.length === 1 ? "" : "s"}`)
      }
      if (result.failed.length > 0) {
        toast.error(`${result.failed.length} could not be reported, see the repositories below`)
      }
    } catch (cause) {
      toast.error(cause instanceof ApiClientError ? cause.message : "Could not report the findings")
    } finally {
      setFiling(null)
    }
  }

  const byRepo = groupByRepo(scan.findings)

  return (
    <section className="reveal overflow-hidden rounded-xl border border-[var(--rule)] bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--rule)] px-4 py-3">
        <div className="min-w-0">
          <p className="mono truncate text-sm font-medium">
            {scan.target}
            {scanBranch(scan) && (
              <span className="font-normal text-[var(--ink-soft)]"> @ {scanBranch(scan)}</span>
            )}
          </p>
          <p className="text-xs text-[var(--ink-soft)]">
            {scan.repos.length} {scan.repos.length === 1 ? "repository" : "repositories"}
            {scan.scanned.length > 0 &&
              ` · ${scan.scanned.reduce((n, r) => n + r.commits, 0)} commits read`}
            {scan.skippedRepos > 0 && ` · ${scan.skippedRepos} beyond the scan limit`}
          </p>
        </div>
        <StatusPill scan={scan} />
      </header>

      {pending && (
        <div className="scanning relative px-4 py-10 text-center text-sm text-[var(--ink-soft)]">
          Reading recent commits on each default branch.
        </div>
      )}

      {scan.status === "failed" &&
        (scan.needsInstall ? (
          <div className="px-4 py-5">
            <InstallCallout
              title={`Pushguard can no longer read ${scan.target}.`}
              message={scan.error ?? ""}
              installUrl={installUrl}
              bare
            />
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-[var(--flag)]">{scan.error ?? "The scan failed."}</p>
        ))}

      {scan.status === "done" && scan.findings.length === 0 && (
        <div className="space-y-1 px-4 py-6">
          <p className="text-sm font-medium">Nothing flagged.</p>
          <p className="text-sm text-[var(--ink-soft)]">
            No rule matched. A scan reads code that is already committed. It cannot see a force
            push, because a force push removes the evidence.
          </p>
        </div>
      )}

      {scan.status === "done" && scan.scanned.length === 0 && scan.findings.length > 0 && (
        <p className="border-t border-[var(--rule)] px-4 py-3 text-xs text-[var(--ink-soft)]">
          This scan predates branch and commit details being recorded. Run it again to see them.
        </p>
      )}

      {scan.status === "done" && scan.scanned.length > 0 && (
        <div className="divide-y divide-[var(--rule)]">
          {scan.scanned.map((read) => {
            const findings = byRepo.get(read.repo) ?? []
            return (
              <div key={read.repo} className="px-4 py-4">
                <ReadHeader
                  read={read}
                  findings={findings.length}
                  filed={scan.filed.find((entry) => entry.repo === read.repo)}
                  failure={failures[read.repo]}
                  busy={filing === read.repo}
                  disabled={filing !== null}
                  onFile={findings.length > 0 ? () => file([read.repo]) : undefined}
                />
                {findings.length > 0 && (
                  <div className="mt-3 space-y-3">
                    {findings.map((finding, index) => (
                      <Finding key={`${finding.ruleId}-${index}`} finding={finding} read={read} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {scan.status === "done" && scan.findings.length > 0 && (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--rule)] bg-[var(--paper-sunk)] px-4 py-3">
          {scan.filed.length > 0 ? (
            <p className="text-sm text-[var(--ink-soft)]">
              Reported as{" "}
              {scan.filed.map((issue, index) => (
                <span key={issue.url}>
                  {index > 0 && ", "}
                  <a href={issue.url} target="_blank" rel="noreferrer" className="underline">
                    {issue.repo}#{issue.number}
                  </a>
                </span>
              ))}
              .
            </p>
          ) : (
            <p className="text-sm text-[var(--ink-soft)]">
              Nothing has been reported to GitHub. These findings live here until you report them.
            </p>
          )}

          {scan.filed.length < byRepo.size && (
            <Button size="sm" onClick={() => file()} disabled={filing !== null}>
              {filing === "*" && <Loader2 className="size-3.5 animate-spin" />}
              Report the rest
            </Button>
          )}
        </footer>
      )}

    </section>
  )
}

/**
 * Nothing to scan is not an error the reader caused, and a red box gives them
 * nothing to do about it. The only useful next step is installing, so that is
 * what the panel offers, primary action, one click, no dead end.
 */
function InstallCallout({
  title,
  message,
  installUrl,
  bare = false,
}: {
  title: string
  message: string
  installUrl: string | null
  bare?: boolean
}) {
  return (
    <div
      className={
        bare ? "space-y-3" : "space-y-3 rounded-xl border border-[var(--rule)] bg-[var(--paper-sunk)] p-5"
      }
    >
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-[var(--ink-soft)]">
          {message || "Install Pushguard on that account to scan its private repositories."}
        </p>
      </div>
      {installUrl ? (
        <div className="flex flex-wrap items-center gap-4">
          <a
            href={installUrl}
            className="mono flex h-10 items-center gap-2 rounded-lg bg-[var(--ink)] px-4 text-sm font-medium text-[var(--paper)] transition-opacity hover:opacity-85"
          >
            Install Pushguard
            <ArrowUpRight className="size-3.5" />
          </a>
          <span className="text-xs text-[var(--ink-soft)]">
            Installing signs you in at the same time.
          </span>
        </div>
      ) : (
        <p className="text-xs text-[var(--ink-soft)]">
          Ask the operator for the installation link, NEXT_PUBLIC_GITHUB_APP_SLUG is not set.
        </p>
      )}
    </div>
  )
}

/** Says which branch was read, how far back, and links the range on GitHub. */
function ReadHeader({
  read,
  findings,
  filed,
  failure,
  busy,
  disabled,
  onFile,
}: {
  read: ScanRepo
  findings: number
  filed?: { number: number; url: string }
  failure?: string
  busy: boolean
  disabled: boolean
  onFile?: () => void
}) {
  const compare = read.baseSha
    ? `https://github.com/${read.repo}/compare/${read.baseSha}...${read.headSha}`
    : `https://github.com/${read.repo}/commit/${read.headSha}`

  return (
    <div className="flex flex-wrap items-baseline justify-between gap-4">
      <p className="mono min-w-0 text-sm">
        <a
          href={`https://github.com/${read.repo}`}
          target="_blank"
          rel="noreferrer"
          className="font-medium underline decoration-[var(--rule)] underline-offset-2 hover:decoration-[var(--ink)]"
        >
          {read.repo}
        </a>
      </p>
      <div className="flex items-center gap-3">
        <p className="mono text-xs text-[var(--ink-soft)]">
          {read.branch} · {read.commits} commit{read.commits === 1 ? "" : "s"} ·{" "}
          <a href={compare} target="_blank" rel="noreferrer" className="underline">
            {read.baseSha ? `${read.baseSha.slice(0, 7)}…${read.headSha.slice(0, 7)}` : read.headSha.slice(0, 7)}
          </a>
          {read.truncated && " · truncated"}
          {findings === 0 && " · clean"}
        </p>

        {/* Reporting is per repository because an issue is per repository, and
            one repository refusing, issues disabled, say, must not stop the rest. */}
        {filed ? (
          <a
            href={filed.url}
            target="_blank"
            rel="noreferrer"
            className="mono flex shrink-0 items-center gap-1 text-xs text-[var(--ink-soft)] underline"
          >
            #{filed.number}
            <ExternalLink className="size-3" />
          </a>
        ) : (
          onFile && (
            <Button variant="outline" size="sm" onClick={onFile} disabled={disabled} className="h-7 shrink-0 text-xs">
              {busy && <Loader2 className="size-3 animate-spin" />}
              Report issue
            </Button>
          )
        )}
      </div>

      {failure && (
        <p className="col-span-full w-full text-xs text-[var(--flag)]">
          Could not report: {failure}
        </p>
      )}
    </div>
  )
}

function Finding({ finding, read }: { finding: ScanFinding; read: ScanRepo }) {
  const loud = finding.severity === "critical" || finding.severity === "high"
  return (
    <div className="gutter-row-tight">
      <span
        className="gutter-mark h-6 text-xs leading-6"
        data-mark={loud ? "-" : "n"}
        aria-hidden
      >
        !
      </span>
      <div className="min-w-0 space-y-1.5">
        <p className="text-sm">
          <span className="mono font-medium">{finding.ruleId}</span>
          <span className={loud ? "text-[var(--flag)]" : "text-[var(--ink-soft)]"}> · {finding.severity}</span>
        </p>
        {finding.description && <p className="text-sm text-[var(--ink-soft)]">{finding.description}</p>}
        {finding.files.length > 0 && (
          <p className="mono flex flex-wrap gap-3 text-xs text-[var(--ink-soft)]">
            {finding.files.map((file) => (
              <a
                key={file}
                // Pinned to the commit that was read rather than to the branch,
                // so the link still shows what was flagged after the next push.
                href={`https://github.com/${finding.repo}/blob/${read.headSha}/${file}`}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-[var(--rule)] underline-offset-2 hover:text-[var(--ink)] hover:decoration-[var(--ink)]"
              >
                {file}
              </a>
            ))}
          </p>
        )}
        {finding.lines.map((line, index) => (
          <p key={index} className="diff-line">
            + {line.trim()}
          </p>
        ))}
      </div>
    </div>
  )
}

function StatusPill({ scan }: { scan: ScanView }) {
  const label =
    scan.status === "done"
      ? `${scan.findings.length} finding${scan.findings.length === 1 ? "" : "s"}`
      : scan.status
  const loud = scan.status === "failed" || (scan.status === "done" && scan.findings.length > 0)
  return (
    <span
      className="mono rounded-md px-2.5 py-1 text-xs font-medium"
      style={{
        color: loud ? "var(--flag)" : "var(--add)",
        background: loud ? "var(--flag-wash)" : "var(--add-wash)",
      }}
    >
      {label}
    </span>
  )
}

// One branch when the scan asked for one or every repository landed on the same
// one; nothing when they differ, because a single label would be a lie.
function scanBranch(scan: ScanView): string | null {
  if (scan.branch) return scan.branch
  const names = new Set(scan.scanned.map((read) => read.branch))
  return names.size === 1 ? [...names][0] : null
}

function groupByRepo(findings: ScanFinding[]): Map<string, ScanFinding[]> {
  const groups = new Map<string, ScanFinding[]>()
  for (const finding of findings) {
    groups.set(finding.repo, [...(groups.get(finding.repo) ?? []), finding])
  }
  for (const list of groups.values()) {
    list.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
  }
  return groups
}
