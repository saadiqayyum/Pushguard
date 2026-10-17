import { count, desc, eq } from "drizzle-orm"
import { boolean, index, integer, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { app, q, systemAccess } from "./client"

// What the AI security expert produced from one input, valid or not, with its
// reasoning and fixture results. The rule itself, when valid, is a draft row.
export const contributorDrafts = app
  .table(
    "contributor_drafts",
    {
      id: uuid().primaryKey().defaultRandom(),
      source: text().notNull(),
      title: text().notNull(),
      requestedBy: text().notNull(),
      inputUrls: jsonb().$type<string[]>().notNull(),
      ruleId: text(),
      ruleVersion: integer(),
      body: jsonb().$type<Record<string, unknown>>(),
      reasoning: text().notNull(),
      fixtureResults: jsonb().$type<unknown>(),
      problems: jsonb().$type<string[]>().notNull(),
      droppedUrls: jsonb().$type<string[]>().notNull(),
      valid: boolean().notNull(),
      state: text().notNull().default("new"),
      createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [systemAccess("contributor_drafts"), index().on(t.state, t.createdAt)],
  )
  .enableRLS()

export type ContributorDraft = typeof contributorDrafts.$inferSelect

export async function insertContributorDraft(row: typeof contributorDrafts.$inferInsert): Promise<string> {
  const [inserted] = await q((tx) => tx.insert(contributorDrafts).values(row).returning({ id: contributorDrafts.id }))
  return inserted.id
}

export async function contributorDraftsPage(
  state: string,
  skip: number,
  limit: number,
): Promise<{ rows: ContributorDraft[]; total: number }> {
  return q(async (tx) => {
    const rows = await tx
      .select()
      .from(contributorDrafts)
      .where(eq(contributorDrafts.state, state))
      .orderBy(desc(contributorDrafts.createdAt))
      .offset(skip)
      .limit(limit)
    const [{ n }] = await tx.select({ n: count() }).from(contributorDrafts).where(eq(contributorDrafts.state, state))
    return { rows, total: n }
  })
}

export async function setContributorDraftState(id: string, state: string): Promise<boolean> {
  const rows = await q((tx) =>
    tx.update(contributorDrafts).set({ state }).where(eq(contributorDrafts.id, id)).returning({ id: contributorDrafts.id }),
  )
  return rows.length > 0
}

export async function contributorDraftById(id: string): Promise<ContributorDraft | null> {
  const rows = await q((tx) => tx.select().from(contributorDrafts).where(eq(contributorDrafts.id, id)).limit(1))
  return rows[0] ?? null
}
