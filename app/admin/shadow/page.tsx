import Link from "next/link"
import { TransitionControls } from "@/components/admin/transition-controls"
import { PageHeader } from "@/components/page-header"
import { asSystem, lastEnteredStatus, platformRulesInStatus, shadowHitsFor, shadowHitSummary } from "@/lib/db"
import { requirePlatformAdmin } from "@/lib/platform/auth"
import { SHADOW_MIN_MS, SHADOW_RECENT_HITS } from "@/lib/platform/limits"
import { auditTarget } from "@/lib/platform/transition"

export const dynamic = "force-dynamic"

const day = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ")

export default async function ShadowPage() {
  await requirePlatformAdmin()
  const entries = await asSystem(async () => {
    const [rows, summary] = await Promise.all([platformRulesInStatus("shadow"), shadowHitSummary()])
    const counts = new Map(summary.map((s) => [`${s.id}@${s.version}`, s]))
    return Promise.all(
      rows.map(async (row) => {
        const since = await lastEnteredStatus(auditTarget("rule", row.id, row.version), "shadow")
        return {
          row,
          counts: counts.get(`${row.id}@${row.version}`),
          since,
          ready: since !== null && Date.now() - since.getTime() >= SHADOW_MIN_MS,
          recent: await shadowHitsFor(row.id, row.version, SHADOW_RECENT_HITS),
        }
      }),
    )
  })

  return (
    <div className="space-y-6">
      <PageHeader title="Shadow results" />
      {entries.length === 0 && <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No rule in shadow</p>}
      {entries.map(({ row, counts, since, ready, recent }) => {
        return (
          <section key={`${row.id}@${row.version}`} aria-label={row.id} className="space-y-4 rounded-md border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/admin/rules/${row.id}`} className="font-medium hover:underline">
                {row.body.description ?? row.id} <span className="font-mono text-xs text-muted-foreground">v{row.version}</span>
              </Link>
              <span className="text-xs text-muted-foreground">
                {since ? `in shadow since ${day(since)} UTC` : "shadow start not recorded"}
                {ready ? "" : ", publishing needs an override"}
              </span>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Hits</dt>
                <dd className="font-medium">{counts?.hits ?? 0}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Repos</dt>
                <dd className="font-medium">{counts?.repos ?? 0}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Last hit</dt>
                <dd className="font-medium">{counts?.last ? day(counts.last) : "none"}</dd>
              </div>
            </dl>
            {recent.length > 0 && (
              <ul className="max-h-60 divide-y overflow-auto rounded-md border text-xs">
                {recent.map((hit) => (
                  <li key={`${hit.repo}-${hit.sha}`} className="flex flex-wrap gap-x-3 px-3 py-1.5 font-mono">
                    <span className="min-w-0 flex-1 truncate">{hit.repo}</span>
                    <span>{hit.sha.slice(0, 10)}</span>
                    <span className="text-muted-foreground">{day(hit.at)}</span>
                  </li>
                ))}
              </ul>
            )}
            <TransitionControls kind="rule" id={row.id} version={row.version} status="shadow" />
          </section>
        )
      })}
    </div>
  )
}
