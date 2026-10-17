import Link from "next/link"
import { SeverityBadge } from "@/components/severity-badge"
import { alertHeadline } from "@/lib/alert-display"
import type { AlertDoc } from "@/lib/db"
import { formatTimestamp } from "@/lib/format"

export function LatestAlerts({ alerts }: { alerts: AlertDoc[] }) {
  return (
    <section aria-labelledby="latest-alerts" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="latest-alerts" className="text-base font-semibold">
          Latest alerts
        </h2>
        <Link href="/dashboard/alerts" className="text-sm text-muted-foreground hover:text-foreground">
          All alerts
        </Link>
      </div>
      {alerts.length === 0 ? (
        <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">No alerts</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {alerts.map((alert) => (
            <li key={`${alert.repo}#${alert.number}`}>
              <Link
                href={`/dashboard/alerts/${alert.repo}/${alert.number}`}
                className="flex min-h-14 flex-col gap-1 px-4 py-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:gap-3"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <SeverityBadge severity={alert.severity} />
                  <span className="truncate text-sm font-medium">{alertHeadline(alert.title, alert.repo)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                  <span className="truncate font-mono">
                    {alert.repo}#{alert.number}
                  </span>
                  <time dateTime={alert.createdAt.toISOString()} className="whitespace-nowrap">
                    {formatTimestamp(alert.createdAt)}
                  </time>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
