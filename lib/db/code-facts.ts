import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm"
import { index, integer, pgPolicy, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { DAY_MS, FACT_RETENTION_DAYS, MAX_RETENTION_DELETE } from "@/lib/code-intel/limits"
import { mergeFileFacts } from "@/lib/code-intel/merge"
import type { Fact, FactDraft, FactKind } from "@/lib/code-intel/types"
import { app, appRole, q, systemAccess } from "./client"

// Capability facts per file, each credited to the commit that introduced it.
// Labels only (a host, a variable name, a rule id), never source.
export const codeFacts = app
  .table(
    "code_facts",
    {
      id: uuid().primaryKey().defaultRandom(),
      repo: text().notNull(),
      path: text().notNull(),
      symbol: text(),
      kind: text().$type<FactKind>().notNull(),
      detail: text().notNull(),
      line: integer(),
      commit: text().notNull(),
      author: text(),
      at: timestamp({ withTimezone: true }).notNull().defaultNow(),
      removedAt: timestamp({ withTimezone: true }),
    },
    (t) => [
      systemAccess("code_facts"),
      index().on(t.repo, t.path),
      index().on(t.repo, t.symbol),
      index().on(t.repo, t.kind, t.at),
      pgPolicy("code_facts_readable", { for: "select", to: appRole, using: sql`authz.can_read(repo)` }),
    ],
  )
  .enableRLS()

const columns = {
  repo: codeFacts.repo,
  path: codeFacts.path,
  symbol: codeFacts.symbol,
  kind: codeFacts.kind,
  detail: codeFacts.detail,
  line: codeFacts.line,
  commit: codeFacts.commit,
  author: codeFacts.author,
  at: codeFacts.at,
}


export type Attribution = { commit: string; author: string | null }

// Replaces the live facts of each file, keeping the original commit on any that
// survived. Removed facts stay for history until retention drops them.
export async function writeFileFacts(
  repo: string,
  files: { path: string; facts: FactDraft[]; by: Attribution }[],
  removed: string[] = [],
): Promise<void> {
  const paths = [...files.map((f) => f.path), ...removed]
  if (paths.length === 0) return
  const now = new Date()
  await q(async (tx) => {
    const stored = await tx
      .select({ id: codeFacts.id, path: codeFacts.path, symbol: codeFacts.symbol, kind: codeFacts.kind, detail: codeFacts.detail, line: codeFacts.line })
      .from(codeFacts)
      .where(and(eq(codeFacts.repo, repo), inArray(codeFacts.path, paths), isNull(codeFacts.removedAt)))
    const byPath = Map.groupBy(stored, (f) => f.path)
    const gone: string[] = removed.flatMap((path) => (byPath.get(path) ?? []).map((f) => f.id))
    const inserts: (typeof codeFacts.$inferInsert)[] = []
    const moved: { id: string; line: number | null }[] = []
    for (const file of files) {
      const plan = mergeFileFacts(byPath.get(file.path) ?? [], file.facts)
      gone.push(...plan.removed)
      moved.push(...plan.moved)
      inserts.push(...plan.insert.map((f) => ({ ...f, repo, ...file.by, at: now })))
    }
    if (moved.length > 0) {
      const values = sql.join(moved.map((m) => sql`(${m.id}::uuid, ${m.line}::int)`), sql`, `)
      await tx.execute(sql`update ${codeFacts} set line = v.line from (values ${values}) as v(id, line) where ${codeFacts.id} = v.id`)
    }
    if (gone.length > 0) await tx.update(codeFacts).set({ removedAt: now }).where(inArray(codeFacts.id, gone))
    if (inserts.length > 0) await tx.insert(codeFacts).values(inserts)
    const cutoff = new Date(now.getTime() - FACT_RETENTION_DAYS * DAY_MS)
    const expired = tx
      .select({ id: codeFacts.id })
      .from(codeFacts)
      .where(and(eq(codeFacts.repo, repo), isNotNull(codeFacts.removedAt), lt(codeFacts.removedAt, cutoff)))
      .limit(MAX_RETENTION_DELETE)
    await tx.delete(codeFacts).where(inArray(codeFacts.id, expired))
  })
}

export async function liveFacts(
  repo: string,
  filter: { path?: string; paths?: string[]; symbol?: string; kind?: FactKind; sinceDays?: number; limit: number },
): Promise<Fact[]> {
  const conditions = [eq(codeFacts.repo, repo), isNull(codeFacts.removedAt)]
  if (filter.path !== undefined) conditions.push(eq(codeFacts.path, filter.path))
  if (filter.paths !== undefined) conditions.push(inArray(codeFacts.path, filter.paths))
  if (filter.symbol !== undefined) conditions.push(eq(codeFacts.symbol, filter.symbol))
  if (filter.kind !== undefined) conditions.push(eq(codeFacts.kind, filter.kind))
  if (filter.sinceDays !== undefined) conditions.push(gte(codeFacts.at, new Date(Date.now() - filter.sinceDays * DAY_MS)))
  return q((tx) => tx.select(columns).from(codeFacts).where(and(...conditions)).orderBy(desc(codeFacts.at)).limit(filter.limit))
}

// Facts recorded in the window, removed ones included: a staged attack may add and drop a piece.
export async function factHistory(repo: string, filter: { sinceDays: number; limit: number }): Promise<Fact[]> {
  const since = new Date(Date.now() - filter.sinceDays * DAY_MS)
  return q((tx) =>
    tx.select(columns).from(codeFacts).where(and(eq(codeFacts.repo, repo), gte(codeFacts.at, since))).orderBy(desc(codeFacts.at)).limit(filter.limit),
  )
}

// Which commits added capabilities to a file or symbol, removed facts included.
export async function factCommits(
  repo: string,
  target: { path?: string; symbol?: string },
  limit: number,
): Promise<{ commit: string; author: string | null; at: Date; kinds: FactKind[] }[]> {
  const conditions = [eq(codeFacts.repo, repo)]
  if (target.path !== undefined) conditions.push(eq(codeFacts.path, target.path))
  if (target.symbol !== undefined) conditions.push(eq(codeFacts.symbol, target.symbol))
  return q((tx) =>
    tx
      .select({
        commit: codeFacts.commit,
        author: codeFacts.author,
        at: sql<Date>`min(${codeFacts.at})`.mapWith(codeFacts.at),
        kinds: sql<FactKind[]>`array_agg(distinct ${codeFacts.kind})`,
      })
      .from(codeFacts)
      .where(and(...conditions))
      .groupBy(codeFacts.commit, codeFacts.author)
      .orderBy(desc(sql`min(${codeFacts.at})`))
      .limit(limit),
  )
}
