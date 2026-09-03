import { OrgSwitcher } from "@/components/org-switcher"
import { PageHeader } from "@/components/page-header"
import { Pager } from "@/components/pager"
import { PullRequestsView } from "@/components/pull-requests-view"
import { pageMember } from "@/lib/auth"
import { listOpenPullRequests } from "@/lib/db"
import { parsePaging } from "@/lib/paging"
import { resolveTenant } from "@/lib/tenant"

export const dynamic = "force-dynamic"

export default async function PullRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const paging = parsePaging(await searchParams)
  const member = await pageMember()
  const tenant = await resolveTenant(member)
  if (!tenant.current) return null
  const { org } = tenant.current

  const page = await listOpenPullRequests(member.login, tenant.allOrgs ? [] : [org], paging)

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 space-y-6">
      <PageHeader
        title="Pull requests"
        description={`Open pull requests across ${tenant.allOrgs ? "all your organizations" : org}, most recently updated first.`}
      />

      <PullRequestsView
        rows={page.rows.map((row) => ({
          id: row._id,
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
        orgSwitcher={
          tenant.installations.length > 1 ? (
            <OrgSwitcher
              orgs={tenant.installations.map((i) => i.org)}
              current={org}
              allOrgs={tenant.allOrgs}
            />
          ) : null
        }
      />

      <Pager
        page={paging.page}
        perPage={paging.perPage}
        total={page.total}
        hasMore={page.hasMore}
        basePath="/dashboard/prs"
      />
    </div>
  )
}
