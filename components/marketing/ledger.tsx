import Link from "next/link"
import { Braces, FileText, Fingerprint, History, ShieldCheck, SquareTerminal, type LucideIcon } from "lucide-react"
import type { MarketingStats } from "@/lib/marketing/stats"

type Entry = { icon: LucideIcon; label: string; value: number; href?: string }

function entries(s: MarketingStats): Entry[] {
  return [
    { icon: FileText, label: "Attack write-ups", value: s.attacks.length, href: "/research" },
    {
      icon: History,
      label: `Incidents in the threat catalogue, ${s.incidents.from} to ${s.incidents.to}`,
      value: s.incidents.count,
      href: "/research/catalog",
    },
    { icon: ShieldCheck, label: `Detection rules in ${s.packs} packs`, value: s.rules },
    { icon: Fingerprint, label: `Indicators from ${s.actors} threat actors`, value: s.indicators },
    { icon: SquareTerminal, label: "Places a change can make code run", value: s.surfaceCount },
    { icon: Braces, label: "Languages parsed", value: s.grammars },
  ]
}

// Every figure is counted from the research docs and the rule catalog at render time.
export function Ledger({ stats }: { stats: MarketingStats }) {
  return (
    <dl className="divide-y rounded-2xl border bg-card/80 px-4 shadow-sm backdrop-blur-sm">
      {entries(stats).map((entry) => (
        <div key={entry.label} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 py-3">
          <entry.icon aria-hidden className="size-[1.125rem] text-primary" strokeWidth={1.75} />
          <dt className="min-w-0 text-sm">
            {entry.href ? (
              <Link href={entry.href} className="underline-offset-4 hover:underline">
                {entry.label}
              </Link>
            ) : (
              entry.label
            )}
          </dt>
          <dd className="display text-[2rem] leading-none tabular-nums">{entry.value}</dd>
        </div>
      ))}
    </dl>
  )
}
