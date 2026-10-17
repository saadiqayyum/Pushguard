import { listAlerts } from "@/lib/db"
import { parsePaging } from "@/lib/paging"
import { respond, userRoute } from "@/lib/route"
import { requireTenant } from "@/lib/tenant"
import { alertListOut } from "@/schemas/output"

// No org: every org the caller can see. Rows are filtered by repo access in SQL.
export const GET = userRoute("/api/alerts", async (request) => {
  const url = new URL(request.url)
  const org = url.searchParams.get("org") || undefined
  const { login } = await requireTenant(org)
  const paging = parsePaging(url.searchParams)

  const result = await listAlerts(login, org ? [org] : [], paging)
  return respond(alertListOut, {
    alerts: result.alerts.map((alert) => ({
      ...alert,
      acknowledgedAt: alert.acknowledgedAt?.toISOString() ?? null,
      createdAt: alert.createdAt.toISOString(),
    })),
    page: { number: paging.page, perPage: paging.perPage, total: result.total, hasMore: result.hasMore },
  })
})
