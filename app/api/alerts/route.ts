import { NextResponse } from "next/server"
import { requireMember } from "@/lib/auth"
import { listAlerts } from "@/lib/db"
import { parsePaging } from "@/lib/paging"
import { withErrorHandler } from "@/lib/route"

// Mongo only. The GitHub issue is still where people triage, but the feed is.
export const GET = withErrorHandler("/api/alerts", async (request) => {
  const url = new URL(request.url)
  const org = url.searchParams.get("org") ?? ""
  const member = await requireMember(org)
  const paging = parsePaging(url.searchParams)

  const result = await listAlerts(member.login, [org], paging)
  return NextResponse.json({
    data: result.alerts.map((alert) => ({
      number: alert.number,
      repo: alert.repo,
      title: alert.title,
      url: alert.url,
      state: alert.state,
      severity: alert.severity,
      acknowledgedAt: alert.acknowledgedAt?.toISOString() ?? null,
      acknowledgedBy: alert.acknowledgedBy,
      assignees: alert.assignees,
      createdAt: alert.createdAt.toISOString(),
    })),
    page: { number: paging.page, perPage: paging.perPage, total: result.total, hasMore: result.hasMore },
  })
})
