import { and, desc, eq, sql } from "drizzle-orm"
import { integer, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import type { Status } from "@/lib/platform/lifecycle"
import type { CheckLanguage } from "@/schemas/staff-rule"
import { app, q, systemAccess } from "./client"

// Signed checks a detonation's check phase runs inside the sandbox. System only:
// served to a runner by the fetch endpoint, never to a user.
export const checkScripts = app
  .table(
    "check_scripts",
    {
      id: text().notNull(),
      version: integer().notNull(),
      language: text().$type<CheckLanguage>().notNull(),
      body: text().notNull(),
      sha256: text().notNull(),
      signature: text(),
      signedBy: text(),
      status: text().$type<Status>().notNull(),
      createdBy: text().notNull(),
      createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
      publishedAt: timestamp({ withTimezone: true }),
    },
    (t) => [systemAccess("check_scripts"), primaryKey({ columns: [t.id, t.version] })],
  )
  .enableRLS()

export type CheckScriptRow = typeof checkScripts.$inferSelect

export async function publishedCheckScript(id: string): Promise<CheckScriptRow | null> {
  const rows = await q((tx) =>
    tx
      .select()
      .from(checkScripts)
      .where(and(eq(checkScripts.id, id), eq(checkScripts.status, "published")))
      .orderBy(desc(checkScripts.version))
      .limit(1),
  )
  return rows[0] ?? null
}

export async function checkScriptVersion(id: string, version: number): Promise<CheckScriptRow | null> {
  const rows = await q((tx) =>
    tx.select().from(checkScripts).where(and(eq(checkScripts.id, id), eq(checkScripts.version, version))).limit(1),
  )
  return rows[0] ?? null
}

export async function insertCheckScript(row: typeof checkScripts.$inferInsert): Promise<void> {
  await q((tx) => tx.insert(checkScripts).values(row))
}

export async function updateCheckScript(
  id: string,
  version: number,
  set: Partial<Pick<CheckScriptRow, "status" | "signature" | "signedBy" | "publishedAt">>,
): Promise<void> {
  await q((tx) => tx.update(checkScripts).set(set).where(and(eq(checkScripts.id, id), eq(checkScripts.version, version))))
}

export async function checkScriptVersions(id: string): Promise<CheckScriptRow[]> {
  return q((tx) => tx.select().from(checkScripts).where(eq(checkScripts.id, id)).orderBy(desc(checkScripts.version)))
}

export async function latestCheckScripts(limit: number): Promise<CheckScriptRow[]> {
  return q((tx) =>
    tx.selectDistinctOn([checkScripts.id]).from(checkScripts).orderBy(checkScripts.id, desc(checkScripts.version)).limit(limit),
  )
}

// Only a draft's content changes; a signed version is immutable.
export async function updateCheckScriptDraft(id: string, version: number, set: Pick<CheckScriptRow, "language" | "body" | "sha256">): Promise<void> {
  await q((tx) =>
    tx.update(checkScripts).set(set).where(and(eq(checkScripts.id, id), eq(checkScripts.version, version), eq(checkScripts.status, "draft"))),
  )
}

// Ids only, for the rule editor's "Run a check" picker. Users cannot read this
// table, so the list comes from a security-definer function (drizzle/0031).
export async function publishedCheckIds(): Promise<string[]> {
  const rows = await q((tx) => tx.execute<{ id: string }>(sql`select id from app.published_check_ids()`))
  return [...rows].map((r) => r.id)
}
