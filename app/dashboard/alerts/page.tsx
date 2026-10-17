import { AlertsView, type AlertRow } from "@/components/alerts-view"
import { OrgSwitcher } from "@/components/org-switcher"
import { PageHeader } from "@/components/page-header"
import { Pager } from "@/components/pager"
import { listAlerts, withUser } from "@/lib/db"
import { parsePaging } from "@/lib/paging"
import { pageTenant } from "@/lib/tenant"

export const dynamic = "force-dynamic"

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; archived?: string }>
}) {
  const params = await searchParams
  const paging = parsePaging(params)
  const archived = params.archived === "1"

  const view = await pageTenant()
  if (!view.current) return null
  const { org } = view.current

  const page = await withUser(view.login, () => listAlerts(view.login, view.allOrgs ? [] : [org], paging, archived))

  const rows: AlertRow[] = page.alerts.map((alert) => ({
    id: `${alert.repo}#${alert.number}`,
    repo: alert.repo,
    number: alert.number,
    title: alert.title,
    severity: alert.severity,
    state: alert.state,
    assignees: alert.assignees,
    acknowledgedBy: alert.acknowledgedBy,
    archived: alert.archivedAt !== null,
    occurrences: alert.occurrences,
    branch: alert.push?.branch ?? null,
    pullRequest: alert.pullRequest?.number ?? null,
    createdAt: alert.createdAt.toISOString(),
  }))

  return (
    <div className="space-y-6">
      <PageHeader title={archived ? "Archived alerts" : "Alerts"} />

      <AlertsView
        alerts={rows}
        total={page.total}
        archived={archived}
        orgSwitcher={
          view.orgs.length > 1 ? (
            <OrgSwitcher orgs={view.orgs.map((o) => o.org)} current={org} allOrgs={view.allOrgs} />
          ) : null
        }
      />

      <Pager
        page={paging.page}
        perPage={paging.perPage}
        total={page.total}
        hasMore={page.hasMore}
        basePath={archived ? "/dashboard/alerts?archived=1" : "/dashboard/alerts"}
      />
    </div>
  )
}
