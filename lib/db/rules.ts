import { and, eq, sql } from "drizzle-orm"
import { boolean, index, jsonb, pgPolicy, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core"
import type { Rule } from "@/schemas/rule"
import { app, appRole, q, systemAccess } from "./client"

// Members read an org's rules; only its admins change them.
export const orgPolicies = (name: string) => [
  pgPolicy(`${name}_member_read`, { for: "select", to: appRole, using: sql`authz.is_member(org)` }),
  pgPolicy(`${name}_admin_insert`, { for: "insert", to: appRole, withCheck: sql`authz.is_admin(org)` }),
  pgPolicy(`${name}_admin_update`, {
    for: "update",
    to: appRole,
    using: sql`authz.is_admin(org)`,
    withCheck: sql`authz.is_admin(org)`,
  }),
  pgPolicy(`${name}_admin_delete`, { for: "delete", to: appRole, using: sql`authz.is_admin(org)` }),
]

export const rules = app
  .table(
    "rules",
    {
      org: text().notNull(),
      ruleId: text().notNull(),
      body: jsonb().$type<Rule>().notNull(),
      enabled: boolean().notNull().default(true),
      createdBy: text().notNull(),
      createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [systemAccess("rules"), primaryKey({ columns: [t.org, t.ruleId] }), ...orgPolicies("rules")],
  )
  .enableRLS()

export type RuleDoc = typeof rules.$inferSelect

export type RuleVersionAction = "created" | "updated" | "enabled" | "disabled" | "reverted" | "deleted"

export const ruleVersions = app
  .table(
    "rule_versions",
    {
      id: uuid().primaryKey().defaultRandom(),
      org: text().notNull(),
      ruleId: text().notNull(),
      body: jsonb().$type<Rule | null>(),
      action: text().$type<RuleVersionAction>().notNull(),
      changedBy: text().notNull(),
      changedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [systemAccess("rule_versions"), index().on(t.org, t.ruleId, t.changedAt), ...orgPolicies("rule_versions")],
  )
  .enableRLS()

export const disabledPacks = app
  .table(
    "disabled_packs",
    {
      org: text().notNull(),
      pack: text().notNull(),
      disabledBy: text().notNull(),
      disabledAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [systemAccess("disabled_packs"), primaryKey({ columns: [t.org, t.pack] }), ...orgPolicies("disabled_packs")],
  )
  .enableRLS()

export async function rulesFor(org: string): Promise<RuleDoc[]> {
  return q((tx) => tx.select().from(rules).where(eq(rules.org, org)))
}

export async function countRules(org: string): Promise<number> {
  const rows = await q((tx) => tx.select({ n: sql<number>`count(*)::int` }).from(rules).where(eq(rules.org, org)))
  return rows[0]?.n ?? 0
}

export async function ruleFor(org: string, ruleId: string): Promise<RuleDoc | null> {
  const rows = await q((tx) =>
    tx.select().from(rules).where(and(eq(rules.org, org), eq(rules.ruleId, ruleId))).limit(1),
  )
  return rows[0] ?? null
}

export async function saveRule(
  org: string,
  ruleId: string,
  fields: { body: Rule; enabled: boolean; createdBy: string },
): Promise<void> {
  await q((tx) =>
    tx
      .insert(rules)
      .values({ org, ruleId, ...fields })
      .onConflictDoUpdate({
        target: [rules.org, rules.ruleId],
        set: { body: fields.body, enabled: fields.enabled, updatedAt: new Date() },
      }),
  )
}

export async function deleteRule(org: string, ruleId: string): Promise<boolean> {
  const rows = await q((tx) =>
    tx.delete(rules).where(and(eq(rules.org, org), eq(rules.ruleId, ruleId))).returning({ ruleId: rules.ruleId }),
  )
  return rows.length > 0
}

export async function recordRuleVersion(
  version: Omit<typeof ruleVersions.$inferInsert, "id" | "changedAt">,
): Promise<void> {
  await q((tx) => tx.insert(ruleVersions).values(version))
}

export async function disabledPacksFor(org: string): Promise<Set<string>> {
  const rows = await q((tx) => tx.select({ pack: disabledPacks.pack }).from(disabledPacks).where(eq(disabledPacks.org, org)))
  return new Set(rows.map((row) => row.pack))
}

export async function setPackDisabled(org: string, pack: string, disabled: boolean, by: string): Promise<void> {
  await q((tx) =>
    disabled
      ? tx.insert(disabledPacks).values({ org, pack, disabledBy: by }).onConflictDoNothing()
      : tx.delete(disabledPacks).where(and(eq(disabledPacks.org, org), eq(disabledPacks.pack, pack))),
  )
}
