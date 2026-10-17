import { and, desc, eq, gte, lt } from "drizzle-orm"
import { index, text, timestamp, uuid } from "drizzle-orm/pg-core"
import type { ChainEvent, ChainKind } from "@/lib/chain"
import { CHAIN_WINDOW_SECONDS, MAX_CHAIN_EVENTS_READ } from "@/lib/ci-limits"
import { app, q, systemAccess } from "./client"

// Recent member, flash-branch and tag-move events per org, joined into the
// tj-actions chain. Pruned past the window on every write. System-only.
export const chainEvents = app
  .table(
    "chain_events",
    {
      id: uuid().primaryKey().defaultRandom(),
      org: text().notNull(),
      repo: text(),
      kind: text().$type<ChainKind>().notNull(),
      login: text(),
      detail: text().notNull(),
      at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [systemAccess("chain_events"), index().on(t.org, t.at)],
  )
  .enableRLS()

const MAX_DETAIL = 300

export async function noteChainEvent(org: string, event: Omit<ChainEvent, "at">): Promise<void> {
  const cutoff = new Date(Date.now() - CHAIN_WINDOW_SECONDS * 1000)
  await q(async (tx) => {
    await tx.delete(chainEvents).where(and(eq(chainEvents.org, org), lt(chainEvents.at, cutoff)))
    await tx.insert(chainEvents).values({ org, ...event, detail: event.detail.slice(0, MAX_DETAIL) })
  })
}

export async function recentChainEvents(org: string, sinceSeconds = CHAIN_WINDOW_SECONDS): Promise<ChainEvent[]> {
  return q((tx) =>
    tx
      .select({ kind: chainEvents.kind, repo: chainEvents.repo, login: chainEvents.login, detail: chainEvents.detail, at: chainEvents.at })
      .from(chainEvents)
      .where(and(eq(chainEvents.org, org), gte(chainEvents.at, new Date(Date.now() - sinceSeconds * 1000))))
      .orderBy(desc(chainEvents.at))
      .limit(MAX_CHAIN_EVENTS_READ),
  )
}

// Who created this branch within the last `seconds`, for spotting a push-and-delete.
export async function branchCreator(org: string, repo: string, ref: string, seconds: number): Promise<string | null> {
  const rows = await q((tx) =>
    tx
      .select({ login: chainEvents.login })
      .from(chainEvents)
      .where(
        and(
          eq(chainEvents.org, org),
          eq(chainEvents.repo, repo),
          eq(chainEvents.kind, "branch_created"),
          eq(chainEvents.detail, ref),
          gte(chainEvents.at, new Date(Date.now() - seconds * 1000)),
        ),
      )
      .orderBy(desc(chainEvents.at))
      .limit(1),
  )
  return rows[0]?.login ?? null
}
