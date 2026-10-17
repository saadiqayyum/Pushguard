import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { Bar } from "@/components/page-skeleton"
import { StatTile, TILE_GRID } from "@/components/overview/stat-tile"
import { Skeleton } from "@/components/ui/skeleton"

const TILES = ["Open alerts", "Alerts, last 7 days", "Repositories watched", "AI tokens today", "AI reviews today", "Background failures"]

// The trend tile carries AlertTrend's h-10 chart, which sets the first row's height.
export default function OverviewLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <PageHeader title="Overview" />
      <div className={`${TILE_GRID} lg:grid-cols-3`}>
        {TILES.map((label, i) => (
          <StatTile key={label} label={label} value={<Bar width="w-16" className="h-8" />}>
            {i === 1 && <Skeleton className="h-10 w-full" />}
          </StatTile>
        ))}
      </div>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Latest alerts</h2>
          <Link href="/dashboard/alerts" className="text-sm text-muted-foreground hover:text-foreground">
            All alerts
          </Link>
        </div>
        <ul className="divide-y rounded-lg border">
          {["w-2/3", "w-1/2", "w-3/5", "w-2/5", "w-1/2"].map((width, i) => (
            <li key={i} className="flex min-h-14 flex-col justify-center gap-1 px-4 py-3">
              <Bar width={width} />
              <Bar width="w-1/3" className="h-4 sm:hidden" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
