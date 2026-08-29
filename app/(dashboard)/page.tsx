import { ExternalLink } from "lucide-react"
import { redirect } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { auth, memberScopes } from "@/lib/auth"
import { listAlertIssues, type AlertPage } from "@/lib/github"
import { MAX_PER_PAGE, parsePaging, type Paging } from "@/lib/paging"
import { Pager } from "@/components/pager"
import { backfillAll, resolveTenant } from "@/lib/tenant"
import type { InstallationDoc } from "@/lib/db"

export const dynamic = "force-dynamic"

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const paging = parsePaging(await searchParams)
  const session = await auth()
  if (!session?.user) redirect("/login")

  const tenant = await resolveTenant(memberScopes({ login: session.login ?? "", orgs: session.orgs ?? [] }))
  if (!tenant.current) return null
  const { org, installationId, accountType, alertsRepo } = tenant.current

  let alerts: AlertPage = { issues: [], total: 0, hasMore: false }
  let loadError = false
  try {
    alerts = tenant.allOrgs
      ? await mergedAlerts(await backfillAll(tenant.installations), paging)
      : await listAlertIssues(installationId, org, accountType ?? "User", paging)
  } catch {
    loadError = true
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Alerts</h1>
        <p className="text-sm text-muted-foreground">
          Flagged pushes across {tenant.allOrgs ? "all your organizations" : org}, newest first.
          Alerts are filed{" "}
          {alertsRepo ? (
            <>
              in <span className="font-medium text-foreground">{alertsRepo}</span>.
            </>
          ) : (
            "in the repository that triggered them."
          )}
        </p>
      </div>

      {loadError && (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            Could not load alerts. Verify the app still has access to your repositories.
          </CardContent>
        </Card>
      )}

      {!loadError && alerts.issues.length === 0 && (
        <Card>
          <CardContent className="text-sm text-muted-foreground">No alerts. Quiet is good.</CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {alerts.issues.map((alert) => (
          <a
            key={`${alert.repo}#${alert.number}`}
            href={alert.html_url}
            target="_blank"
            rel="noreferrer"
            className="flex flex-col gap-2 rounded-lg border px-4 py-3 transition-colors hover:bg-accent sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium sm:truncate">{alert.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {alert.repo}#{alert.number} · {new Date(alert.created_at).toLocaleString()}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {severityBadge(alert)}
              <Badge variant={alert.state === "open" ? "default" : "outline"}>{alert.state}</Badge>
              <ExternalLink className="size-3.5 text-muted-foreground" />
            </div>
          </a>
        ))}
      </div>

      <Pager
        page={paging.page}
        perPage={paging.perPage}
        total={alerts.total}
        hasMore={alerts.hasMore}
        basePath="/"
      />
    </div>
  )
}

// Each installation is a separate GitHub search, so a merged feed pulls the same
// window from every source and re-sorts it. Totals add up exactly; ordering is
// exact for any page that fits inside one upstream request.
//
// ponytail: pages deeper than MAX_PER_PAGE items per source can miss older
// entries. Switch to a stored alerts collection if deep paging ever matters.
async function mergedAlerts(installations: InstallationDoc[], paging: Paging): Promise<AlertPage> {
  const window = Math.min(paging.skip + paging.perPage, MAX_PER_PAGE)
  const pages = await Promise.all(
    installations.map((i) =>
      listAlertIssues(i.installationId, i.org, i.accountType ?? "User", {
        page: 1,
        perPage: window,
        skip: 0,
      }),
    ),
  )
  const issues = pages
    .flatMap((p) => p.issues)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const total = pages.reduce((sum, p) => sum + p.total, 0)
  return {
    issues: issues.slice(paging.skip, paging.skip + paging.perPage),
    total,
    hasMore: paging.skip + paging.perPage < total,
  }
}

function severityBadge(alert: AlertPage["issues"][number]) {
  const label = alert.labels.find((l) => l.name.startsWith("severity:"))?.name.split(":")[1]
  if (!label) return null
  const variant = label === "critical" ? "destructive" : label === "high" ? "default" : "secondary"
  return <Badge variant={variant}>{label}</Badge>
}
