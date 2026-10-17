"use client"

import { useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { CategoryIcon } from "@/components/marketing/category-icon"
import { InlineCode } from "@/components/marketing/inline-code"
import { STATUS_LABEL, StatusBadge } from "@/components/marketing/status-badge"
import { CATEGORIES, type CategoryId } from "@/lib/marketing/categories"
import type { StatusCounts } from "@/lib/marketing/counts"
import { attackStatus, type AttackStatus } from "@/lib/marketing/parse"

export type LibraryEntry = {
  url: string
  title: string
  when: string
  summary: string
  status: AttackStatus
  category: CategoryId
}

export type LibraryFilter = { category: CategoryId | null; status: AttackStatus | null }

type Props = {
  entries: LibraryEntry[]
  categories: { id: CategoryId; title: string; count: number }[]
  statuses: StatusCounts
  initial?: LibraryFilter
}

const UNFILTERED: LibraryFilter = { category: null, status: null }

const STATUSES = Object.keys(STATUS_LABEL) as AttackStatus[]

const CHIP =
  "inline-flex h-9 items-center gap-2 rounded-full border bg-card/80 px-3.5 text-sm transition-colors hover:bg-accent aria-pressed:border-primary aria-pressed:bg-accent aria-pressed:text-accent-foreground"

// The filter lives in the query string so a link can open the library pre-filtered.
// Chip counts are library totals, the same numbers as the summary line above.
export function Library({ entries, categories, statuses, initial = UNFILTERED }: Props) {
  const [filter, setFilter] = useState(initial)

  function update(next: LibraryFilter) {
    setFilter(next)
    const query = new URLSearchParams()
    if (next.category) query.set("category", next.category)
    if (next.status) query.set("status", next.status)
    const search = query.toString()
    window.history.replaceState(null, "", search ? `?${search}` : window.location.pathname)
  }

  const matches = (entry: LibraryEntry, f: Partial<LibraryFilter>) =>
    (!f.category || entry.category === f.category) && (!f.status || entry.status === f.status)
  const shown = entries.filter((entry) => matches(entry, filter))
  const groups = categories
    .map((category) => ({ ...category, items: shown.filter((entry) => entry.category === category.id) }))
    .filter((group) => group.items.length > 0)

  return (
    <div className="min-w-0">
      <div className="flex flex-col gap-3">
        <div role="group" aria-label="Category" className="flex flex-wrap gap-2">
          <button type="button" className={CHIP} aria-pressed={!filter.category} onClick={() => update({ ...filter, category: null })}>
            All
            <span className="text-muted-foreground tabular-nums">{entries.length}</span>
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              data-cat={category.id}
              className={CHIP}
              aria-pressed={filter.category === category.id}
              onClick={() => update({ ...filter, category: filter.category === category.id ? null : category.id })}
            >
              <span aria-hidden className="size-2 rounded-full bg-[var(--cat)]" />
              {category.title}
              <span className="text-muted-foreground tabular-nums">
                {category.count}
              </span>
            </button>
          ))}
        </div>
        <div role="group" aria-label="Status" className="flex flex-wrap gap-2">
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className={CHIP}
              aria-pressed={filter.status === status}
              onClick={() => update({ ...filter, status: filter.status === status ? null : status })}
            >
              {STATUS_LABEL[status]}
              <span className="text-muted-foreground tabular-nums">
                {statuses[status]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="mt-10 text-muted-foreground">No write-ups match.</p>
      ) : (
        groups.map((group) => (
          <section key={group.id} data-cat={group.id} aria-labelledby={`cat-${group.id}`} className="mt-10">
            <div className="flex items-center gap-3">
              <CategoryIcon category={group.id} />
              <h2 id={`cat-${group.id}`} className="text-[1.75rem]!">
                {group.title}
              </h2>
              <span className="text-muted-foreground tabular-nums">{group.items.length}</span>
            </div>
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {group.items.map((entry) => (
                <li key={entry.url}>
                  <Link
                    href={entry.url}
                    className="flex h-full flex-col rounded-2xl border bg-card/80 p-4 shadow-sm backdrop-blur-sm transition-colors hover:border-[var(--cat)]"
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="display text-[1.1875rem] leading-tight">{entry.title}</span>
                      <StatusBadge status={entry.status} />
                    </span>
                    <span className="mt-1 text-xs text-muted-foreground tabular-nums">{entry.when}</span>
                    <span className="mt-2 text-sm leading-relaxed text-muted-foreground"><InlineCode text={entry.summary} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

// Reads the query on the client so the page stays static; render it inside Suspense
// with an unfiltered <Library> as the fallback, which is what the server HTML lists.
export function QueryLibrary(props: Omit<Props, "initial">) {
  const query = useSearchParams()
  const status = query.get("status")
  const initial: LibraryFilter = {
    category: CATEGORIES.find((c) => c.id === query.get("category"))?.id ?? null,
    status: status ? attackStatus(status) : null,
  }
  return <Library {...props} initial={initial} />
}
