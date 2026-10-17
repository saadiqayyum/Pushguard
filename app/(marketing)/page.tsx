import type { Metadata } from "next"
import Link from "next/link"
import { BookOpen } from "lucide-react"
import { CONTAINER } from "@/components/app-header"
import { AiReview } from "@/components/marketing/ai-review"
import { Backdrop } from "@/components/marketing/backdrop"
import { DriftIcons } from "@/components/marketing/drift-icons"
import { CategoryIcon } from "@/components/marketing/category-icon"
import { Ledger } from "@/components/marketing/ledger"
import { Record } from "@/components/marketing/record"
import { StartCta } from "@/components/marketing/start-cta"
import { SurfaceMap } from "@/components/marketing/surface-map"
import { marketingStats } from "@/lib/marketing/stats"

export const metadata: Metadata = { alternates: { canonical: "/" } }

// Editorial picks from docs/attacks; everything shown about each is read from its write-up.
const RECORD = [
  "packages/event-stream",
  "multi-stage/xz-utils",
  "ci-cd/tag-repointing-tj-actions",
  "packages/shai-hulud-1",
  "ci-cd/ghostaction",
  "hidden-code/invisible-unicode-glassworm",
  "packages/axios-2026",
  "packages/chaindrop-keyv-2026",
  "packages/zod-standard-schema-nub-2026",
]

const SECONDARY =
  "inline-flex h-11 items-center gap-2 rounded-lg border bg-card/80 px-5 text-[0.9375rem] font-medium transition-colors hover:bg-accent"

export default function LandingPage() {
  const stats = marketingStats()
  const record = RECORD.flatMap((path) => stats.attacks.filter((a) => `${a.category}/${a.slug}` === path))

  const cta = <StartCta />

  return (
    <>
      <Backdrop />
      <DriftIcons />

      <section className={`${CONTAINER} grid gap-10 pt-12 pb-16 sm:pt-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16 lg:pt-24`}>
        <div className="min-w-0">
          <h1>Attacks now arrive as commits.</h1>
          <p className="mt-6 max-w-md text-[1.125rem] leading-relaxed text-muted-foreground">
            Pushguard reads every push across your GitHub organization and files an issue when a change matches a
            known attack.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {cta}
            <Link href="/research" className={SECONDARY}>
              <BookOpen aria-hidden className="size-[1.125rem]" strokeWidth={1.75} />
              Read the research
            </Link>
          </div>
        </div>
        <Ledger stats={stats} />
      </section>

      <section aria-labelledby="ai" className={`${CONTAINER} pb-12`}>
        <AiReview />
      </section>

      <section aria-labelledby="record" className={`${CONTAINER} grid gap-8 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16`}>
        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <h2 id="record">The change that gave each one away</h2>
          <p className="mt-4 max-w-sm text-muted-foreground">
            {record.length} incidents from the library, each with the change that gave it away.
          </p>
          <ul className="mt-6 flex flex-col gap-2 text-sm" aria-label="Categories">
            {stats.byCategory.map((category) => (
              <li key={category.id} data-cat={category.id} className="flex items-center gap-2.5">
                <CategoryIcon category={category.id} size="sm" />
                <Link href={`/research?category=${category.id}`} className="underline-offset-4 hover:underline">
                  {category.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <Record attacks={record} />
      </section>

      <section aria-labelledby="surfaces" className={`${CONTAINER} py-12`}>
        <h2 id="surfaces" className="max-w-2xl">Every place a change can make code run</h2>
        <p className="mt-4 mb-8 max-w-2xl text-muted-foreground">
          {stats.surfaceCount} places, grouped by when the code runs.
        </p>
        <SurfaceMap families={stats.surfaces} />
      </section>

      <section aria-labelledby="start" className={`${CONTAINER} pt-12`}>
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="start" className="max-w-md">
            Start with one repository.
          </h2>
          {cta}
        </div>
      </section>
    </>
  )
}
