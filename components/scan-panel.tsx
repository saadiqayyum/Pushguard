"use client"

import { useState } from "react"
import { useLive } from "@/components/live-updates"
import { CircleDot, ExternalLink, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { api, ApiClientError } from "@/lib/api-client"
import type { ScanFinding, ScanRepo, ScanView } from "@/lib/db"

import { InstallCallout } from "@/components/scan-picker"

export { ScanPicker } from "@/components/scan-picker"

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const

export function ScanReport({ initial, installUrl }: { initial: ScanView; installUrl: string | null }) {
  const [scan, setScan] = useState(initial)
  const [filing, setFiling] = useState<string | null>(null)
  const [awaiting, setAwaiting] = useState<{ filed: number; failed: number } | null>(null)
  const [failures, setFailures] = useState<Record<string, string>>({})
  const pending = scan.status === "queued" || scan.status === "running"

  async function refetch() {
    try {
      const next = await api<ScanView>(`/api/scans/${scan.id}`)
      setScan(next)
      setFailures(Object.fromEntries(next.filingFailed.map((f) => [f.repo, f.reason])))
      if (!awaiting) return
      const added = next.filed.length - awaiting.filed
      const failed = next.filingFailed.length - awaiting.failed
      if (added <= 0 && failed <= 0) return
      setAwaiting(null)
      if (added > 0) toast.success(`Reported ${added} issue${added === 1 ? "" : "s"}`)
      if (failed > 0) toast.error(`${next.filingFailed.length} could not be reported`)
    } catch {}
  }
  useLive("scan", refetch)
  useLive("alert", refetch)

  async function file(repos?: string[]) {
    setFiling(repos?.[0] ?? "*")
    try {
      await api(`/api/scans/${scan.id}/file`, { method: "POST", body: repos ? { repos } : {} })
      setAwaiting({ filed: scan.filed.length, failed: scan.filingFailed.length })
    } catch (cause) {
      toast.error(cause instanceof ApiClientError ? cause.message : "Could not report the findings")
    } finally {
      setFiling(null)
    }
  }

  const byRepo = groupByRepo(scan.findings)

  return (
    <section className="reveal overflow-hidden rounded-lg border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="mono truncate text-sm font-medium">
            {scan.target}
            {scanBranch(scan) && (
              <span className="font-normal text-muted-foreground"> @ {scanBranch(scan)}</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {scan.repos.length} {scan.repos.length === 1 ? "repository" : "repositories"}
            {scan.scanned.length > 0 &&
              ` · ${scan.scanned.reduce((n, r) => n + r.commits, 0)} commits read`}
            {scan.skippedRepos > 0 && ` · ${scan.skippedRepos} beyond the scan limit`}
          </p>
        </div>
        <StatusPill scan={scan} />
      </header>

      {pending && (
        <div className="scanning relative px-4 py-10 text-center text-sm text-muted-foreground">
          Scanning
        </div>
      )}

      {scan.status === "failed" &&
        (scan.needsInstall ? (
          <div className="px-4 py-5">
            <InstallCallout
              title={`Pushguard can no longer read ${scan.target}.`}
              message={scan.error ?? undefined}
              installUrl={installUrl}
              bare
            />
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-[var(--flag)]">{scan.error ?? "The scan failed."}</p>
        ))}

      {scan.status === "done" && scan.findings.length === 0 && (
        <p className="px-4 py-6 text-sm font-medium">Nothing flagged</p>
      )}

      {scan.status === "done" && scan.scanned.length > 0 && (
        <div className="divide-y divide-border">
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
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted px-4 py-3">
          {awaiting ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
              Filing issues on GitHub
            </p>
          ) : scan.filed.length > 0 ? (
            <p className="text-sm text-muted-foreground">
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
            <p className="text-sm text-muted-foreground">Not reported</p>
          )}

          {scan.filed.length < byRepo.size && (
            <Button size="sm" onClick={() => file()} disabled={filing !== null}>
              {filing === "*" ? <Loader2 className="size-3.5 animate-spin" /> : <CircleDot className="size-3.5" />}
              Report the rest
            </Button>
          )}
        </footer>
      )}

    </section>
  )
}

// Nothing to scan is not an error the reader caused, and a red box gives them.
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
          className="font-medium underline decoration-border underline-offset-2 hover:decoration-foreground"
        >
          {read.repo}
        </a>
      </p>
      <div className="flex items-center gap-3">
        <p className="mono text-xs text-muted-foreground">
          {read.branch} · {read.commits} commit{read.commits === 1 ? "" : "s"} ·{" "}
          <a href={compare} target="_blank" rel="noreferrer" className="underline">
            {read.baseSha ? `${read.baseSha.slice(0, 7)}…${read.headSha.slice(0, 7)}` : read.headSha.slice(0, 7)}
          </a>
          {read.truncated && " · truncated"}
          {findings === 0 && " · clean"}
        </p>

        {filed ? (
          <a
            href={filed.url}
            target="_blank"
            rel="noreferrer"
            className="mono flex shrink-0 items-center gap-1 text-xs text-muted-foreground underline"
          >
            #{filed.number}
            <ExternalLink className="size-3" />
          </a>
        ) : (
          onFile && (
            <Button variant="outline" size="sm" onClick={onFile} disabled={disabled} className="h-7 shrink-0 text-xs">
              {busy ? <Loader2 className="size-3 animate-spin" /> : <CircleDot className="size-3" />}
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
          <span className={loud ? "text-[var(--flag)]" : "text-muted-foreground"}> · {finding.severity}</span>
        </p>
        {finding.description && <p className="text-sm text-muted-foreground">{finding.description}</p>}
        {finding.files.length > 0 && (
          <p className="mono flex flex-wrap gap-3 text-xs text-muted-foreground">
            {finding.files.map((file) => (
              <a
                key={file}
                href={`https://github.com/${finding.repo}/blob/${read.headSha}/${file}`}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-border underline-offset-2 hover:text-foreground hover:decoration-foreground"
              >
                {file}
              </a>
            ))}
          </p>
        )}
        {finding.lines.map((line, index) => (
          <p key={index} className={finding.prose ? "diff-note" : "diff-line"}>
            {finding.prose ? line.trim() : `+ ${line.trim()}`}
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
