import { AlertsView, type AlertRow } from "@/components/alerts-view";
import { OrgSwitcher } from "@/components/org-switcher";
import { PageHeader } from "@/components/page-header";
import { Pager } from "@/components/pager";
import { pageMember } from "@/lib/auth";
import { listAlerts } from "@/lib/db";
import { parsePaging } from "@/lib/paging";
import { resolveTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; archived?: string }>;
}) {
  const params = await searchParams;
  const paging = parsePaging(params);
  const archived = params.archived === "1";

  const member = await pageMember();
  const tenant = await resolveTenant(member);
  if (!tenant.current) return null;
  const { org } = tenant.current;

  const page = await listAlerts(
    member.login,
    tenant.allOrgs ? [] : [org],
    paging,
    archived,
  );

  const rows: AlertRow[] = page.alerts.map((alert) => ({
    id: alert._id,
    repo: alert.repo,
    number: alert.number,
    title: alert.title,
    severity: alert.severity,
    state: alert.state,
    assignees: alert.assignees ?? [],
    acknowledgedBy: alert.acknowledgedBy,
    archived: alert.archivedAt !== null,
    occurrences: alert.occurrences ?? 1,
    branch: alert.push?.branch ?? null,
    createdAt: alert.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 space-y-6">
      <PageHeader
        title={archived ? "Archived alerts" : "Alerts"}
        description={
          archived ? (
            "Hidden from the feed. The GitHub issues are untouched."
          ) : (
            <>
              Flagged pushes across {tenant.allOrgs ? "all your organizations" : org}, newest
              first. Alerts are filed in the repository that triggered them.
            </>
          )
        }
      />

      <AlertsView
        alerts={rows}
        archived={archived}
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
        basePath={archived ? "/dashboard?archived=1" : "/dashboard"}
      />
    </div>
  );
}
