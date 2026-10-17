"use client"

import { useEffect, useState } from "react"
import { ArrowUpRight, Loader2, Search } from "lucide-react"
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
import type { ScanView } from "@/lib/db"

type ScanTarget = {
  installationId: number
  account: string
  accountType: "User" | "Organization"
  repos: string[]
}

const ALL_REPOS = ""
// Empty means "whatever GitHub says the default is", resolved server-side.
const NO_AI = "none"
const DEFAULT_BRANCH = ""
// Radix Select refuses an empty item value, so the two "no choice" options need
// a name of their own on the way in and out.
const ALL_REPOS_VALUE = "__all__"
const DEFAULT_BRANCH_VALUE = "__default__"

// The scan picker. There is deliberately no text field: a box the reader types a.
export function ScanPicker({
  installUrl,
  initialAccount,
  initialRepo,
  aiKeys = [],
  onStarted,
}: {
  installUrl: string | null
  initialAccount?: string
  initialRepo?: string | null
  aiKeys?: { id: string; label: string; model: string }[]
  onStarted?: () => void
}) {
  const [targets, setTargets] = useState<ScanTarget[] | null>(null)
  const [account, setAccount] = useState("")
  const [repo, setRepo] = useState(ALL_REPOS)
  const [branch, setBranch] = useState(DEFAULT_BRANCH)
  const [aiKey, setAiKey] = useState(NO_AI)
  const [branches, setBranches] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    api<ScanTarget[]>("/api/scan-targets")
      .then((loaded) => {
        setTargets(loaded)
        const wanted = loaded.find((target) => target.account === initialAccount)
        setAccount(wanted?.account ?? loaded[0]?.account ?? "")
        if (wanted && initialRepo && wanted.repos.includes(initialRepo)) setRepo(initialRepo)
      })
      .catch((cause) =>
        setError(cause instanceof ApiClientError ? cause.message : "Could not load your repositories."),
      )
  }, [initialAccount, initialRepo])

  const selected = targets?.find((target) => target.account === account)

  function selectRepo(next: string) {
    setRepo(next)
    setBranch(DEFAULT_BRANCH)
    setBranches(null)
  }

  useEffect(() => {
    if (repo === ALL_REPOS || !selected) return
    let current = true
    api<{ branches: string[]; defaultBranch: string }>(
      `/api/scan-branches?installationId=${selected.installationId}&repo=${encodeURIComponent(repo)}`,
    )
      .then((loaded) => current && setBranches(loaded.branches))
      .catch(() => current && setBranches([]))
    return () => {
      current = false
    }
  }, [repo, selected])
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
      const scan = await api<ScanView>("/api/scans", {
          method: "POST",
        body: {
          installationId: selected.installationId,
          ...(repo === ALL_REPOS ? {} : { repo }),
          ...(repo !== ALL_REPOS && branch !== DEFAULT_BRANCH ? { branch } : {}),
          ...(aiKey === NO_AI ? {} : { aiKey }),
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
    return <p className="text-sm text-muted-foreground">Loading repositories</p>
  }

  if (targets?.length === 0) {
    return (
      <InstallCallout
        title="Not installed on any account you can read"
        installUrl={installUrl}
      />
    )
  }

  return (
    <div className="space-y-5">
      {missingTarget && (
        <InstallCallout
          title={`${initialRepo ?? initialAccount} is not available`}
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

        {aiKeys.length > 0 && (
          <label className="min-w-0 flex-1 space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">AI review</span>
            <Select value={aiKey} onValueChange={setAiKey}>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_AI}>Pattern rules only</SelectItem>
                {aiKeys.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.label} · {entry.model}
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

export function InstallCallout({
  title,
  message,
  installUrl,
  bare = false,
}: {
  title: string
  message?: string
  installUrl: string | null
  bare?: boolean
}) {
  return (
    <div
      className={
        bare ? "space-y-3" : "space-y-3 rounded-lg border bg-muted p-5"
      }
    >
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </div>
      {installUrl ? (
        <Button asChild className="w-fit">
          <a href={installUrl}>
            Install Pushguard
            <ArrowUpRight className="size-3.5" />
          </a>
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          Install link not configured (NEXT_PUBLIC_GITHUB_APP_SLUG).
        </p>
      )}
    </div>
  )
}

// Says which branch was read, how far back, and links the range on GitHub.
