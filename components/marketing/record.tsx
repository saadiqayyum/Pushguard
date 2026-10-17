import Link from "next/link"
import { CategoryIcon } from "@/components/marketing/category-icon"
import { InlineCode } from "@/components/marketing/inline-code"
import { categoryTitle } from "@/lib/marketing/categories"
import type { Attack } from "@/lib/marketing/stats"

const lastYear = (when: string) => Math.max(...(when.match(/\b20\d\d\b/g) ?? ["0"]).map(Number))

// A git graph read top to bottom: one commit node per incident.
export function Record({ attacks }: { attacks: Attack[] }) {
  const rows = [...attacks].sort((a, b) => lastYear(a.when) - lastYear(b.when))
  return (
    <ol className="relative">
      {rows.map((attack, index) => {
        const year = lastYear(attack.when)
        const newYear = index === 0 || lastYear(rows[index - 1].when) !== year
        return (
          <li key={attack.url} data-cat={attack.category} className="grid grid-cols-[3.25rem_1.5rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[4.5rem_2rem_minmax(0,1fr)] sm:gap-x-4">
            <p className="display pt-5 text-right text-[1.375rem] leading-none tabular-nums text-muted-foreground sm:text-[1.75rem]">
              {newYear ? year : ""}
            </p>
            <div className="relative flex justify-center" aria-hidden>
              <span className="absolute inset-y-0 w-0.5 bg-border" />
              <span className="relative mt-6 size-3.5 rounded-full border-2 border-[var(--cat)] bg-[var(--cat)] ring-4 ring-background" />
            </div>
            <article className="mb-5 min-w-0 rounded-2xl border bg-card/80 p-4 shadow-sm backdrop-blur-sm sm:p-5">
              <div className="flex items-start gap-3">
                <CategoryIcon category={attack.category} />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground tabular-nums">
                    <span className="text-[var(--cat)]">{categoryTitle(attack.category)}</span>
                    <span className="px-1.5">/</span>
                    {attack.when}
                  </p>
                  <h3 className="mt-1">
                    <Link href={attack.url} className="underline-offset-4 hover:underline">
                      {attack.title}
                    </Link>
                  </h3>
                </div>
              </div>
              <p className="mt-3 max-w-prose text-[0.9375rem] leading-relaxed text-muted-foreground">
                <InlineCode text={attack.summary} />
              </p>
              {attack.signal && (
                <p className="mt-4 max-w-prose rounded-lg border bg-muted/40 px-3 py-2 text-sm leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">In one change: </span>
                  <InlineCode text={attack.signal} />
                </p>
              )}
            </article>
          </li>
        )
      })}
    </ol>
  )
}
