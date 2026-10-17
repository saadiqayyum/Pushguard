import { AlertTriangle, ChevronRight } from "lucide-react"
import type { JobFailure } from "@/lib/db"

const LABELS: Record<string, string> = {
  index: "Indexing",
  sync_repos: "Sync",
  sync_repo_access: "Sync",
  sync_org_members: "Sync",
  sync_team_repo: "Sync",
  sync_team_member: "Sync",
  push: "Push evaluation",
  pull_request: "Pull request evaluation",
  scan: "Scan",
  file_scan: "Filing",
  review_session: "AI review",
  runner_report: "Runner",
  runner_deadline: "Runner",
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" })
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
]

function ago(date: Date): string {
  const seconds = Math.round((date.getTime() - Date.now()) / 1000)
  const [unit, size] = STEPS.find(([, s]) => Math.abs(seconds) >= s) ?? ["second", 1]
  return RELATIVE.format(Math.round(seconds / size), unit)
}

function Line({ failure }: { failure: JobFailure }) {
  return (
    <li className="flex min-w-0 items-center gap-2 text-sm">
      <AlertTriangle className="size-4 shrink-0 text-destructive/80" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{LABELS[failure.type] ?? failure.type} failed</span>
        <span className="text-muted-foreground">
          {" · "}
          <span className="font-mono text-xs">{failure.subject}</span>
          {" · "}
          {failure.reason}
        </span>
      </span>
      <time dateTime={failure.failedAt.toISOString()} className="shrink-0 text-xs text-muted-foreground">
        {ago(failure.failedAt)}
      </time>
    </li>
  )
}

// Server-rendered and absent when empty, so it never shifts the page after load.
export function JobFailures({ failures }: { failures: JobFailure[] }) {
  if (failures.length === 0) return null
  const frame = "mb-6 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2"
  if (failures.length === 1) {
    return (
      <ul id="failures" role="status" className={frame}>
        <Line failure={failures[0]} />
      </ul>
    )
  }
  return (
    <details id="failures" role="status" className={`group ${frame}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <AlertTriangle className="size-4 shrink-0 text-destructive/80" aria-hidden />
        <span className="flex-1 tabular-nums">{failures.length} background tasks failed</span>
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
      </summary>
      <ul className="mt-2 space-y-1.5 border-t border-destructive/10 pt-2">
        {failures.map((failure) => (
          <Line key={failure.id} failure={failure} />
        ))}
      </ul>
    </details>
  )
}
