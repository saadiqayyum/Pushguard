import { OrgSwitcher } from "@/components/org-switcher"
import { PageHeader } from "@/components/page-header"
import { Pager } from "@/components/pager"
import { PullRequestsView } from "@/components/pull-requests-view"
import { listOpenPullRequests, withUser } from "@/lib/db"
import { parsePaging } from "@/lib/paging"
import { pageTenant } from "@/lib/tenant"

export const dynamic = "force-dynamic"

export default async function PullRequestsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const paging = parsePaging(await searchParams)
  const view = await pageTenant()
  if (!view.current) return null
  const { org } = view.current

  const page = await withUser(view.login, () =>
    listOpenPullRequests(view.login, view.allOrgs ? [] : [org], paging),
  )

  return (
    <div className="space-y-6">
      <PageHeader title="Pull requests" />

      <PullRequestsView
        rows={page.rows.map((row) => ({
          id: `${row.repo}#${row.number}`,
          repo: row.repo,
          number: row.number,
          title: row.title,
          author: row.author,
          headRef: row.headRef,
          baseRef: row.baseRef,
          draft: row.draft,
          url: row.url,
          openAlerts: row.openAlerts,
          updatedAt: row.updatedAt.toISOString(),
        }))}
        total={page.total}
        orgSwitcher={
          view.orgs.length > 1 ? (
            <OrgSwitcher orgs={view.orgs.map((o) => o.org)} current={org} allOrgs={view.allOrgs} />
          ) : null
        }
      />

      <Pager page={paging.page} perPage={paging.perPage} total={page.total} hasMore={page.hasMore} basePath="/dashboard/prs" />
    </div>
  )
}
