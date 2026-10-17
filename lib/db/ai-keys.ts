import { and, asc, eq, sql } from "drizzle-orm"
import { integer, pgPolicy, text, timestamp } from "drizzle-orm/pg-core"
import { app, appRole, q, systemAccess } from "./client"
import type { AiProvider, PublicAiKey } from "./installations"

// The app role is granted every column but the three sealed ones, so no user
// query can select a key, whatever its WHERE clause.
export const aiKeys = app
  .table(
    "ai_keys",
    {
      id: text().primaryKey(),
      org: text().notNull(),
      label: text().notNull(),
      provider: text().$type<AiProvider>().notNull(),
      keyHint: text().notNull(),
      model: text().notNull(),
      effort: text().$type<"low" | "medium" | "high">().notNull(),
      baseUrl: text(),
      maxOutputTokens: integer(),
      thinkingBudget: integer(),
      timeoutMs: integer(),
      ciphertext: text().notNull(),
      iv: text().notNull(),
      tag: text().notNull(),
      addedBy: text().notNull(),
      addedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    () => [systemAccess("ai_keys"), 
      pgPolicy("ai_keys_admin", {
        for: "all",
        to: appRole,
        using: sql`authz.is_admin(org)`,
        withCheck: sql`authz.is_admin(org)`,
      }),
    ],
  )
  .enableRLS()

export type SealedAiKey = typeof aiKeys.$inferSelect

const publicColumns = {
  id: aiKeys.id,
  label: aiKeys.label,
  provider: aiKeys.provider,
  keyHint: aiKeys.keyHint,
  model: aiKeys.model,
  effort: aiKeys.effort,
  baseUrl: aiKeys.baseUrl,
  maxOutputTokens: aiKeys.maxOutputTokens,
  thinkingBudget: aiKeys.thinkingBudget,
  timeoutMs: aiKeys.timeoutMs,
}

export async function publicAiKeys(org: string): Promise<PublicAiKey[]> {
  const rows = await q((tx) =>
    tx.select(publicColumns).from(aiKeys).where(eq(aiKeys.org, org)).orderBy(asc(aiKeys.addedAt)),
  )
  return rows.map(({ baseUrl, maxOutputTokens, thinkingBudget, timeoutMs, ...rest }) => ({
    ...rest,
    ...(baseUrl ? { baseUrl } : {}),
    ...(maxOutputTokens ? { maxOutputTokens } : {}),
    ...(thinkingBudget ? { thinkingBudget } : {}),
    ...(timeoutMs ? { timeoutMs } : {}),
  }))
}

export async function aiKeyOptions(org: string): Promise<{ id: string; label: string; model: string }[]> {
  return (await publicAiKeys(org)).map(({ id, label, model }) => ({ id, label, model }))
}

export async function insertAiKey(key: typeof aiKeys.$inferInsert): Promise<void> {
  await q((tx) => tx.insert(aiKeys).values(key))
}

export async function updateAiKey(
  org: string,
  id: string,
  patch: Partial<
    Pick<SealedAiKey, "label" | "model" | "effort" | "baseUrl" | "maxOutputTokens" | "thinkingBudget" | "timeoutMs">
  >,
): Promise<boolean> {
  const rows = await q((tx) =>
    tx.update(aiKeys).set(patch).where(and(eq(aiKeys.org, org), eq(aiKeys.id, id))).returning({ id: aiKeys.id }),
  )
  return rows.length > 0
}

export async function deleteAiKey(org: string, id: string): Promise<boolean> {
  const rows = await q((tx) =>
    tx.delete(aiKeys).where(and(eq(aiKeys.org, org), eq(aiKeys.id, id))).returning({ id: aiKeys.id }),
  )
  return rows.length > 0
}

export async function countAiKeys(org: string): Promise<number> {
  const rows = await q((tx) => tx.select({ n: sql<number>`count(*)::int` }).from(aiKeys).where(eq(aiKeys.org, org)))
  return rows[0]?.n ?? 0
}

// System context only: the app role cannot read these columns.
export async function sealedAiKey(org: string, id: string): Promise<SealedAiKey | null> {
  const rows = await q((tx) => tx.select().from(aiKeys).where(and(eq(aiKeys.org, org), eq(aiKeys.id, id))).limit(1))
  return rows[0] ?? null
}

// Provider and secret have no UPDATE grant, so changing them replaces the row
// under the same id, in one transaction.
export async function replaceAiKey(key: typeof aiKeys.$inferInsert): Promise<boolean> {
  return q(async (tx) => {
    const removed = await tx
      .delete(aiKeys)
      .where(and(eq(aiKeys.org, key.org), eq(aiKeys.id, key.id)))
      .returning({ id: aiKeys.id })
    if (removed.length === 0) return false
    await tx.insert(aiKeys).values(key)
    return true
  })
}
