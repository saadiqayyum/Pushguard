import { and, asc, eq, sql } from "drizzle-orm"
import { bigint, boolean, integer, jsonb, pgPolicy, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import type { AiRule } from "@/schemas/ai-rule"
import { app, appRole, q, systemAccess } from "./client"

export const aiRules = app
  .table(
    "ai_rules",
    {
      org: text().notNull(),
      ruleId: text().notNull(),
      body: jsonb().$type<AiRule>().notNull(),
      enabled: boolean().notNull().default(true),
      createdBy: text().notNull(),
      createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [systemAccess("ai_rules"), 
      primaryKey({ columns: [t.org, t.ruleId] }),
      pgPolicy("ai_rules_member_read", { for: "select", to: appRole, using: sql`authz.is_member(org)` }),
      pgPolicy("ai_rules_admin_insert", { for: "insert", to: appRole, withCheck: sql`authz.is_admin(org)` }),
      pgPolicy("ai_rules_admin_update", {
        for: "update",
        to: appRole,
        using: sql`authz.is_admin(org)`,
        withCheck: sql`authz.is_admin(org)`,
      }),
      pgPolicy("ai_rules_admin_delete", { for: "delete", to: appRole, using: sql`authz.is_admin(org)` }),
    ],
  )
  .enableRLS()

export type AiRuleDoc = typeof aiRules.$inferSelect

export async function aiRulesFor(org: string, onlyEnabled = false): Promise<AiRuleDoc[]> {
  return q((tx) =>
    tx
      .select()
      .from(aiRules)
      .where(and(eq(aiRules.org, org), onlyEnabled ? eq(aiRules.enabled, true) : undefined))
      .orderBy(asc(aiRules.createdAt)),
  )
}

export async function aiRuleFor(org: string, ruleId: string): Promise<AiRuleDoc | null> {
  const rows = await q((tx) =>
    tx.select().from(aiRules).where(and(eq(aiRules.org, org), eq(aiRules.ruleId, ruleId))).limit(1),
  )
  return rows[0] ?? null
}

export async function countAiRules(org: string): Promise<number> {
  const rows = await q((tx) => tx.select({ n: sql<number>`count(*)::int` }).from(aiRules).where(eq(aiRules.org, org)))
  return rows[0]?.n ?? 0
}

export async function insertAiRule(rule: typeof aiRules.$inferInsert): Promise<void> {
  await q((tx) => tx.insert(aiRules).values(rule))
}

export async function updateAiRule(
  org: string,
  ruleId: string,
  patch: Partial<Pick<AiRuleDoc, "body" | "enabled">>,
): Promise<boolean> {
  const rows = await q((tx) =>
    tx
      .update(aiRules)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(aiRules.org, org), eq(aiRules.ruleId, ruleId)))
      .returning({ ruleId: aiRules.ruleId }),
  )
  return rows.length > 0
}

export async function deleteAiRule(org: string, ruleId: string): Promise<boolean> {
  const rows = await q((tx) =>
    tx.delete(aiRules).where(and(eq(aiRules.org, org), eq(aiRules.ruleId, ruleId))).returning({ ruleId: aiRules.ruleId }),
  )
  return rows.length > 0
}

export const aiUsage = app
  .table(
    "ai_usage",
    {
      org: text().notNull(),
      day: text().notNull(),
      reviews: integer().notNull().default(0),
      inputTokens: bigint({ mode: "number" }).notNull().default(0),
      outputTokens: bigint({ mode: "number" }).notNull().default(0),
      reservedTokens: bigint({ mode: "number" }).notNull().default(0),
    },
    (t) => [
      systemAccess("ai_usage"),
      primaryKey({ columns: [t.org, t.day] }),
      pgPolicy("ai_usage_admin_read", { for: "select", to: appRole, using: sql`authz.is_admin(org)` }),
    ],
  )
  .enableRLS()

const today = () => new Date().toISOString().slice(0, 10)

// Count one review against the account's day and say whether it may run.
export async function claimAiReview(org: string, cap: number): Promise<boolean> {
  const day = today()
  const rows = await q((tx) =>
    tx
      .insert(aiUsage)
      .values({ org, day, reviews: 1 })
      .onConflictDoUpdate({ target: [aiUsage.org, aiUsage.day], set: { reviews: sql`${aiUsage.reviews} + 1` } })
      .returning({ reviews: aiUsage.reviews }),
  )
  return (rows[0]?.reviews ?? 1) <= cap
}

// Holds a call's worst case against the day before it is made, atomically, so
// concurrent jobs cannot overspend the cap between a read and a write.
export async function reserveAiTokens(org: string, tokens: number, cap: number): Promise<boolean> {
  if (tokens > cap) return false
  const rows = await q((tx) =>
    tx
      .insert(aiUsage)
      .values({ org, day: today(), reservedTokens: tokens })
      .onConflictDoUpdate({
        target: [aiUsage.org, aiUsage.day],
        set: { reservedTokens: sql`${aiUsage.reservedTokens} + ${tokens}` },
        setWhere: sql`${aiUsage.inputTokens} + ${aiUsage.outputTokens} + ${aiUsage.reservedTokens} + ${tokens} <= ${cap}`,
      })
      .returning({ org: aiUsage.org }),
  )
  return rows.length > 0
}

// Swaps a reservation for what the provider reported.
export async function settleAiTokens(org: string, reserved: number, input: number, output: number): Promise<void> {
  await q((tx) =>
    tx
      .update(aiUsage)
      .set({
        reservedTokens: sql`greatest(0, ${aiUsage.reservedTokens} - ${reserved})`,
        inputTokens: sql`${aiUsage.inputTokens} + ${input}`,
        outputTokens: sql`${aiUsage.outputTokens} + ${output}`,
      })
      .where(and(eq(aiUsage.org, org), eq(aiUsage.day, today()))),
  )
}

export type AiUsageToday = { reviews: number; inputTokens: number; outputTokens: number }

export async function aiUsageToday(org: string): Promise<AiUsageToday> {
  const rows = await q((tx) =>
    tx
      .select({ reviews: aiUsage.reviews, inputTokens: aiUsage.inputTokens, outputTokens: aiUsage.outputTokens })
      .from(aiUsage)
      .where(and(eq(aiUsage.org, org), eq(aiUsage.day, today())))
      .limit(1),
  )
  return rows[0] ?? { reviews: 0, inputTokens: 0, outputTokens: 0 }
}
