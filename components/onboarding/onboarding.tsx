import { ArrowUpRight, Building2, Check, Loader2 } from "lucide-react"
import { SetupLaterButton } from "@/components/onboarding/setup-later-button"
import { GitHubMark } from "@/components/site-chrome"
import { Button } from "@/components/ui/button"
import type { OnboardingStep, SyncProgress } from "@/lib/dashboard-state"
import { cn } from "@/lib/utils"

type StepId = OnboardingStep | "ready"
type State = "done" | "current" | "todo"

export type OnboardingProps = {
  step: OnboardingStep
  org: string | null
  admin: boolean
  pendingOrgs: string[]
  installUrl: string | null
  settingsUrl: string | null
  progress: SyncProgress
}

const TITLES: Record<StepId, string> = {
  install: "Install the GitHub App",
  sync: "Sync repositories",
  ready: "Watch pushes",
}

// A collaborator never installs anything, so they see only the wait.
export function Onboarding(props: OnboardingProps) {
  const ids: StepId[] = props.admin || !props.org ? ["install", "sync", "ready"] : ["sync", "ready"]
  const at = ids.indexOf(props.step)

  return (
    <div className="mx-auto w-full max-w-lg">
      <h1 className="text-2xl font-semibold tracking-tight">Set up Pushguard</h1>
      <ol className="mt-8">
        {ids.map((id, index) => {
          const state: State = index < at ? "done" : index === at ? "current" : "todo"
          return (
            <li
              key={id}
              aria-current={state === "current" ? "step" : undefined}
              className="relative flex gap-4 pb-8 last:pb-0"
            >
              {index < ids.length - 1 && (
                <span aria-hidden className={cn("absolute top-8 bottom-0 left-[0.9375rem] w-px", state === "done" ? "bg-primary" : "bg-border")} />
              )}
              <Marker state={state} index={index} />
              <div className="min-w-0 flex-1 pt-1">
                <h2 className={cn("text-sm font-medium", state === "current" ? "text-base" : "text-muted-foreground")}>
                  {id === "install" && props.pendingOrgs.length > 0 && state === "current" ? "Ask an owner to install" : TITLES[id]}
                  <span className="sr-only">{state === "done" ? ", done" : state === "todo" ? ", not started" : ""}</span>
                </h2>
                {state === "current" && (
                  <div className="mt-3 rounded-lg border bg-card p-4">
                    {id === "install" ? <InstallBody {...props} /> : <SyncBody {...props} />}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function Marker({ state, index }: { state: State; index: number }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium",
        state === "done" && "border-primary bg-primary text-primary-foreground",
        state === "current" && "border-primary bg-background text-foreground ring-4 ring-primary/10",
        state === "todo" && "bg-background text-muted-foreground",
      )}
    >
      {state === "done" ? <Check className="size-4" /> : index + 1}
    </span>
  )
}

function InstallBody({ pendingOrgs, installUrl }: OnboardingProps) {
  const asking = pendingOrgs.length > 0
  return (
    <div className="space-y-4">
      {asking && (
        <ul className="space-y-1.5 text-sm" aria-label="Organizations without Pushguard">
          {pendingOrgs.map((org) => (
            <li key={org} className="flex min-w-0 items-center gap-2">
              <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate font-medium">{org}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {installUrl ? (
          <Button asChild>
            <a href={installUrl}>
              <GitHubMark className="size-4" />
              {asking ? "Request install on GitHub" : "Install on GitHub"}
            </a>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Install link not configured (NEXT_PUBLIC_GITHUB_APP_SLUG).</p>
        )}
        <Button asChild variant="ghost">
          <a href="/api/install/complete?resync=1">Check again</a>
        </Button>
      </div>
    </div>
  )
}

function SyncBody({ admin, org, progress, settingsUrl }: OnboardingProps) {
  if (admin && progress.total === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">No repositories selected</p>
        {settingsUrl && (
          <Button asChild variant="outline" size="sm">
            <a href={settingsUrl} target="_blank" rel="noreferrer">
              Choose repositories on GitHub
              <ArrowUpRight className="size-4" aria-hidden />
            </a>
          </Button>
        )}
      </div>
    )
  }
  if (!admin) {
    return (
      <p className="flex items-center gap-2 text-sm" role="status">
        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
        Syncing repositories
      </p>
    )
  }
  const percent = Math.round((progress.synced / progress.total) * 100)
  return (
    <div className="space-y-3">
      <p className="text-sm tabular-nums" role="status">
        Syncing {progress.synced} of {progress.total} {progress.total === 1 ? "repository" : "repositories"}
      </p>
      <div
        role="progressbar"
        aria-label="Repositories synced"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.synced}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${percent}%` }} />
      </div>
      {org && progress.synced > 0 && <SetupLaterButton org={org} />}
    </div>
  )
}
