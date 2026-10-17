import { and, desc, eq, sql } from "drizzle-orm"
import { index, integer, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"
import { MAX_SHADOW_HITS_PER_VERSION } from "@/lib/rules/advanced/limits"
import { app, q, systemAccess } from "./client"

// What a staff rule version in shadow would have filed. System only: the console reads it.
export const ruleShadowHits = app
  .table(
    "rule_shadow_hits",
    {
      rowId: uuid().primaryKey().defaultRandom(),
      id: text().notNull(),
      version: integer().notNull(),
      repo: text().notNull(),
      sha: text().notNull(),
      at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [systemAccess("rule_shadow_hits"), unique().on(t.id, t.version, t.repo, t.sha), index().on(t.id, t.version, t.at)],
  )
  .enableRLS()

export async function insertShadowHit(id: string, version: number, repo: string, sha: string): Promise<void> {
  await q(async (tx) => {
    await tx.insert(ruleShadowHits).values({ id, version, repo, sha }).onConflictDoNothing()
    const keep = tx
      .select({ rowId: ruleShadowHits.rowId })
      .from(ruleShadowHits)
      .where(and(eq(ruleShadowHits.id, id), eq(ruleShadowHits.version, version)))
      .orderBy(desc(ruleShadowHits.at))
      .limit(MAX_SHADOW_HITS_PER_VERSION)
    await tx
      .delete(ruleShadowHits)
      .where(and(eq(ruleShadowHits.id, id), eq(ruleShadowHits.version, version), sql`${ruleShadowHits.rowId} not in (${keep})`))
  })
}

export async function shadowHitsFor(id: string, version: number, limit: number) {
  return q((tx) =>
    tx
      .select({ repo: ruleShadowHits.repo, sha: ruleShadowHits.sha, at: ruleShadowHits.at })
      .from(ruleShadowHits)
      .where(and(eq(ruleShadowHits.id, id), eq(ruleShadowHits.version, version)))
      .orderBy(desc(ruleShadowHits.at))
      .limit(Math.min(limit, MAX_SHADOW_HITS_PER_VERSION)),
  )
}

// Per version in shadow: how many hits, on how many repos, and when last.
export async function shadowHitSummary(): Promise<{ id: string; version: number; hits: number; repos: number; last: Date | null }[]> {
  return q((tx) =>
    tx
      .select({
        id: ruleShadowHits.id,
        version: ruleShadowHits.version,
        hits: sql<number>`count(*)::int`,
        repos: sql<number>`count(distinct ${ruleShadowHits.repo})::int`,
        last: sql<Date | null>`max(${ruleShadowHits.at})`.mapWith(ruleShadowHits.at),
      })
      .from(ruleShadowHits)
      .groupBy(ruleShadowHits.id, ruleShadowHits.version),
  )
}
