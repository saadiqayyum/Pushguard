import Link from "next/link"
import { ChevronRight } from "lucide-react"

export const TILE_GRID = "grid gap-4 sm:grid-cols-2"

export function StatTile({
  label,
  value,
  href,
  children,
}: {
  label: string
  value: React.ReactNode
  href?: string
  children?: React.ReactNode
}) {
  return (
    <section className="flex min-h-36 flex-col gap-3 rounded-lg border bg-card p-4">
      <h2 className="flex h-5 items-center text-sm text-muted-foreground">
        {href ? (
          <Link href={href} className="group flex items-center gap-1 rounded-sm hover:text-foreground">
            {label}
            <ChevronRight className="size-3.5 opacity-60 group-hover:opacity-100" aria-hidden />
          </Link>
        ) : (
          label
        )}
      </h2>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {children && <div className="mt-auto text-sm text-muted-foreground">{children}</div>}
    </section>
  )
}

// A ratio against a limit. The fill turns destructive past 90%.
export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const share = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-1.5 overflow-hidden rounded-full bg-primary/15"
    >
      <div className={share >= 90 ? "h-full rounded-full bg-destructive" : "h-full rounded-full bg-primary"} style={{ width: `${share}%` }} />
    </div>
  )
}
