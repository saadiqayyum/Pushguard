import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { SetupChecklist } from "@/components/onboarding/setup-checklist"
import { setupHiddenCookie } from "@/components/onboarding/setup-cookie"
import { AlertTrend } from "@/components/overview/alert-trend"
import { LatestAlerts } from "@/components/overview/latest-alerts"
import { Meter, StatTile, TILE_GRID } from "@/components/overview/stat-tile"
import { OrgSwitcher } from "@/components/org-switcher"
import { PageHeader } from "@/components/page-header"
import { SeverityBadge } from "@/components/severity-badge"
import { clampLimit } from "@/lib/ai-budget"
import {
  activeInstallation,
  aiUsageToday,
  alertCounts,
  countAiKeys,
  countOpenJobFailures,
  countSinks,
  countSyncedRepos,
  listAlerts,
  OVERVIEW_LATEST_ALERTS,
  OVERVIEW_TREND_DAYS,
  withUser,
} from "@/lib/db"
import { formatCompact, formatNumber } from "@/lib/format"
import { fillDays } from "@/lib/overview"
import { pageTenant } from "@/lib/tenant"
import { SEVERITIES } from "@/schemas/rule"

export const dynamic = "force-dynamic"

const BY_RANK = [...SEVERITIES].reverse()

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams
  if (params.archived || params.page) redirect(`/dashboard/alerts?${new URLSearchParams(params)}`)

  const view = await pageTenant()
  if (!view.current) return null
  const { org, role } = view.current
  const admin = role === "admin"
  const orgs = view.allOrgs ? [] : [org]
  const setupHidden = (await cookies()).has(setupHiddenCookie(org))

  const [counts, latest, installation, synced, failures, usage, keys, sinks] = await withUser(view.login, () =>
    Promise.all([
      alertCounts(view.login, orgs, OVERVIEW_TREND_DAYS),
      listAlerts(view.login, orgs, { skip: 0, perPage: OVERVIEW_LATEST_ALERTS }),
      activeInstallation(org),
      countSyncedRepos(org),
      countOpenJobFailures(view.orgs.map((o) => o.org)),
      admin ? aiUsageToday(org) : null,
      admin ? countAiKeys(org) : 0,
      admin ? countSinks(org) : 0,
    ]),
  )

  const open = new Map(counts.open.map((row) => [row.severity, row.n]))
  const openTotal = counts.open.reduce((sum, row) => sum + row.n, 0)
  const days = fillDays(counts.daily, OVERVIEW_TREND_DAYS)
  const weekTotal = days.reduce((sum, d) => sum + d.n, 0)
  const watched = installation?.repos?.length ?? 0
  const budget = clampLimit("dailyTokenBudget", installation?.aiDailyTokenBudget)
  const used = usage ? usage.inputTokens + usage.outputTokens : 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        actions={
          view.orgs.length > 1 && (
            <OrgSwitcher orgs={view.orgs.map((o) => o.org)} current={org} allOrgs={view.allOrgs} />
          )
        }
      />

      <div className={`${TILE_GRID} ${admin ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
        <StatTile label="Open alerts" value={formatNumber(openTotal)} href="/dashboard/alerts">
          <ul className="flex flex-wrap gap-1.5">
            {BY_RANK.map((severity) => (
              <li key={severity}>
                <SeverityBadge severity={severity} count={formatNumber(open.get(severity) ?? 0)} className="gap-1.5" />
              </li>
            ))}
          </ul>
        </StatTile>

        <StatTile label={`Alerts, last ${OVERVIEW_TREND_DAYS} days`} value={formatNumber(weekTotal)}>
          <AlertTrend days={days} />
        </StatTile>

        <StatTile label="Repositories watched" value={formatNumber(watched)}>
          <span className="tabular-nums">{formatNumber(synced)} synced</span>
        </StatTile>

        {usage && (
          <StatTile label="AI tokens today" value={formatCompact(used)} href="/dashboard/ai">
            <div className="space-y-2">
              <Meter value={used} max={budget} label="AI tokens used today" />
              <p className="tabular-nums">of {formatCompact(budget)} daily budget</p>
            </div>
          </StatTile>
        )}

        {usage && (
          <StatTile label="AI reviews today" value={formatNumber(usage.reviews)} href="/dashboard/ai">
            <span className="tabular-nums">
              {formatCompact(usage.inputTokens)} in, {formatCompact(usage.outputTokens)} out
            </span>
          </StatTile>
        )}

        <StatTile label="Background failures" value={formatNumber(failures)} href={failures > 0 ? "#failures" : undefined} />
      </div>

      <LatestAlerts alerts={latest.alerts} />

      {admin && !setupHidden && <SetupChecklist org={org} sink={sinks > 0} aiKey={keys > 0} />}
    </div>
  )
}
