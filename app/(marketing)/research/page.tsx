import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { History } from "lucide-react"
import { FullSearchTrigger } from "fumadocs-ui/layouts/shared/slots/search-trigger"
import { CONTAINER } from "@/components/app-header"
import { Backdrop } from "@/components/marketing/backdrop"
import { Library, QueryLibrary } from "@/components/marketing/library"
import { marketingStats } from "@/lib/marketing/stats"

const TITLE = "Attack research"
const DESCRIPTION =
  "Plain-language write-ups of real and possible attacks on code repositories, with the signs each one leaves in a commit."

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/research" },
  openGraph: { type: "website", siteName: "Pushguard", title: TITLE, description: DESCRIPTION, url: "/research" },
}

export default function ResearchPage() {
  const stats = marketingStats()
  const entries = stats.attacks.map((a) => ({
    url: a.url,
    title: a.title,
    when: a.when,
    summary: a.summary,
    status: a.status,
    category: a.category,
  }))
  const library = { entries, categories: stats.byCategory, statuses: stats.byStatus }

  return (
    <>
      <Backdrop />
      <div className={`${CONTAINER} pt-12 sm:pt-16`}>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-end">
          <div className="min-w-0">
            <h1>Attack library</h1>
            <p className="mt-5 max-w-xl text-[1.125rem] leading-relaxed text-muted-foreground">
              {stats.attacks.length} write-ups of attacks on code repositories. {stats.byStatus.confirmed} confirmed,{" "}
              {stats.byStatus.reported} reported, {stats.byStatus.possible} not yet seen.
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <FullSearchTrigger className="h-11 w-full rounded-xl border bg-card/80 text-[0.9375rem]" />
            <Link
              href="/research/catalog"
              className="flex items-center gap-3 rounded-2xl border bg-card/80 p-4 shadow-sm backdrop-blur-sm transition-colors hover:bg-accent"
            >
              <History aria-hidden className="size-5 shrink-0 text-primary" strokeWidth={1.75} />
              <span className="min-w-0">
                <span className="block font-medium">Threat catalogue</span>
                <span className="block text-sm text-muted-foreground tabular-nums">
                  {stats.incidents.count} incidents from {stats.incidents.from} to {stats.incidents.to} and the attack
                  classes
                </span>
              </span>
            </Link>
          </div>
        </div>
        <div className="mt-10">
          <Suspense fallback={<Library {...library} />}>
            <QueryLibrary {...library} />
          </Suspense>
        </div>
      </div>
    </>
  )
}
