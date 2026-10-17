import { cookies } from "next/headers"
import { Loader2 } from "lucide-react"
import { LiveUpdates } from "@/components/live-updates"
import { Onboarding } from "@/components/onboarding/onboarding"
import { AppHeader, CONTAINER } from "@/components/app-header"
import { JobFailures } from "@/components/job-failures"
import { UserMenu } from "@/components/user-menu"
import { installationSettingsUrl, navLinks, onboardingStep, SETUP_LATER_COOKIE } from "@/lib/dashboard-state"
import { activeInstallation, countSyncedRepos, openJobFailures, withUser } from "@/lib/db"
import { installUrl } from "@/lib/install-url"
import { liveTopics } from "@/lib/realtime"
import { SignInGate } from "@/components/signin-dialog"
import { TermsGate } from "@/components/terms-gate"
import { currentUser } from "@/lib/auth"
import { pageTenant, pageTerms } from "@/lib/tenant"
import { TERMS_VERSION } from "@/lib/terms"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!(await currentUser())) return <SignInGate />
  if (!(await pageTerms()).accepted) return <TermsGate version={TERMS_VERSION} />
  const view = await pageTenant()
  const current = view.current
  const admin = current?.role === "admin"
  const [installation, synced] =
    current && (admin || current.syncing)
      ? await withUser(view.login, () => Promise.all([activeInstallation(current.org), countSyncedRepos(current.org)]))
      : [null, 0]
  const failures = await withUser(view.login, () => openJobFailures(view.orgs.map((o) => o.org)))
  const progress = { synced, total: installation?.repos?.length ?? 0 }
  const deferred = Boolean(current) && (await cookies()).get(SETUP_LATER_COOKIE)?.value === current?.org
  const step = onboardingStep(view, progress, deferred)
  const topics = liveTopics([view.login, ...view.orgs.map((o) => o.org), ...view.pendingOrgs])

  return (
    <LiveUpdates topics={topics}>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <AppHeader links={current && !step ? navLinks(current.role) : []}>
          <UserMenu login={view.login} />
        </AppHeader>

        <main className={`${CONTAINER} flex-1 py-6 sm:py-8`}>
          <JobFailures failures={failures} />
          {step ? (
            <Onboarding
              step={step}
              org={current?.org ?? null}
              admin={!current || admin}
              pendingOrgs={view.pendingOrgs}
              installUrl={installUrl()}
              settingsUrl={
                installation
                  ? installationSettingsUrl(installation.org, installation.installationId, installation.accountType)
                  : null
              }
              progress={progress}
            />
          ) : (
            <>
              {admin && progress.synced < progress.total && (
                <p role="status" className="mb-6 flex h-9 items-center gap-2 rounded-lg border bg-muted/40 px-3 text-sm text-muted-foreground tabular-nums">
                  <Loader2 className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
                  Syncing {progress.synced} of {progress.total} repositories
                </p>
              )}
              {children}
            </>
          )}
        </main>
      </div>
    </LiveUpdates>
  )
}
