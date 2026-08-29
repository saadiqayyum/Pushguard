import { NextResponse } from "next/server"
import { requireMember } from "@/lib/auth"
import { activeInstallation } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { listAlertIssues } from "@/lib/github"
import { parsePaging } from "@/lib/paging"
import { withErrorHandler } from "@/lib/route"

export const GET = withErrorHandler("/api/alerts", async (request) => {
  const url = new URL(request.url)
  const org = url.searchParams.get("org") ?? ""
  await requireMember(org)
  const paging = parsePaging(url.searchParams)

  const installation = await activeInstallation(org)
  if (!installation) throw new AppError("not_found", "Installation not found")

  const result = await listAlertIssues(
    installation.installationId,
    org,
    installation.accountType ?? "User",
    paging,
  )
  const data = result.issues.map((issue) => ({
    number: issue.number,
    repo: issue.repo,
    title: issue.title,
    url: issue.html_url,
    state: issue.state,
    createdAt: issue.created_at,
    labels: issue.labels.map((l) => l.name),
  }))
  return NextResponse.json({
    data,
    page: { number: paging.page, perPage: paging.perPage, total: result.total, hasMore: result.hasMore },
  })
})
