import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const LABEL = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
const label = (day: string) => LABEL.format(new Date(`${day}T00:00:00Z`))

// One column per day; today in the accent, earlier days recessive.
export function AlertTrend({ days }: { days: { day: string; n: number }[] }) {
  const peak = Math.max(1, ...days.map((d) => d.n))
  return (
    <>
      <div aria-hidden className="flex h-10 items-end gap-1">
        {days.map((d, i) => (
          <Tooltip key={d.day}>
            <TooltipTrigger asChild>
              <div className="flex h-full flex-1 items-end">
                <div
                  className={
                    d.n === 0
                      ? "h-0.5 w-full rounded-full bg-border"
                      : i === days.length - 1
                        ? "w-full rounded-t-sm bg-primary"
                        : "w-full rounded-t-sm bg-muted-foreground/40"
                  }
                  style={d.n === 0 ? undefined : { height: `${Math.max(8, (d.n / peak) * 100)}%` }}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <span className="tabular-nums">
                {label(d.day)}: {d.n}
              </span>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <ul className="sr-only">
        {days.map((d) => (
          <li key={d.day}>
            {label(d.day)}: {d.n} {d.n === 1 ? "alert" : "alerts"}
          </li>
        ))}
      </ul>
    </>
  )
}
