import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { integer, jsonb, pgPolicy, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import type { Status } from "@/lib/platform/lifecycle"
import { MAX_STAFF_RULES_LOADED } from "@/lib/rules/advanced/limits"
import type { StaffRule } from "@/schemas/staff-rule"
import { app, appRole, q, systemAccess } from "./client"

// Staff-published rules, versioned and signed: overrides of shipped catalog
// rules and rules of their own. Every org reads the published ones, because the
// rules loader runs inside user requests; shadow and internal rows only the system sees.
export const platformRules = app
  .table(
    "platform_rules",
    {
      id: text().notNull(),
      version: integer().notNull(),
      body: jsonb().$type<StaffRule>().notNull(),
      status: text().$type<Status>().notNull(),
      signature: text(),
      signedBy: text(),
      createdBy: text().notNull(),
      createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
      publishedAt: timestamp({ withTimezone: true }),
    },
    (t) => [
      systemAccess("platform_rules"),
      primaryKey({ columns: [t.id, t.version] }),
      pgPolicy("platform_rules_published_read", { for: "select", to: appRole, using: sql`status = 'published'` }),
    ],
  )
  .enableRLS()

export type PlatformRuleRow = typeof platformRules.$inferSelect

const RUNNABLE: Status[] = ["published", "internal", "shadow"]

// Under RLS a user request gets only the published rows of this.
export async function runnablePlatformRules(): Promise<PlatformRuleRow[]> {
  return q((tx) =>
    tx
      .select()
      .from(platformRules)
      .where(inArray(platformRules.status, RUNNABLE))
      .orderBy(platformRules.id, desc(platformRules.version))
      .limit(MAX_STAFF_RULES_LOADED),
  )
}

export async function platformRulesInStatus(status: Status): Promise<PlatformRuleRow[]> {
  return q((tx) =>
    tx.select().from(platformRules).where(eq(platformRules.status, status)).orderBy(platformRules.id, desc(platformRules.version)).limit(MAX_STAFF_RULES_LOADED),
  )
}

export async function platformRuleVersions(id: string): Promise<PlatformRuleRow[]> {
  return q((tx) => tx.select().from(platformRules).where(eq(platformRules.id, id)).orderBy(desc(platformRules.version)))
}

// The newest version of every staff rule, for the console list.
export async function latestPlatformRules(): Promise<PlatformRuleRow[]> {
  return q((tx) =>
    tx
      .selectDistinctOn([platformRules.id])
      .from(platformRules)
      .orderBy(platformRules.id, desc(platformRules.version))
      .limit(MAX_STAFF_RULES_LOADED),
  )
}

export async function insertPlatformRule(row: typeof platformRules.$inferInsert): Promise<void> {
  await q((tx) => tx.insert(platformRules).values(row))
}

export async function updatePlatformRule(
  id: string,
  version: number,
  set: Partial<Pick<PlatformRuleRow, "body" | "status" | "signature" | "signedBy" | "publishedAt">>,
): Promise<void> {
  await q((tx) => tx.update(platformRules).set(set).where(and(eq(platformRules.id, id), eq(platformRules.version, version))))
}
