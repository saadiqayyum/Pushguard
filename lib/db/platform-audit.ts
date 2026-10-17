import { and, count, desc, eq, sql } from "drizzle-orm"
import { index, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { AUDIT_DETAILS_MAX_BYTES } from "@/lib/platform/limits"
import { app, q, systemAccess } from "./client"

// Every mutating staff action. System-only: no user query can read or forge a row.
export const platformAudit = app
  .table(
    "platform_audit",
    {
      id: uuid().primaryKey().defaultRandom(),
      actor: text().notNull(),
      action: text().notNull(),
      target: text().notNull(),
      details: jsonb().$type<Record<string, unknown>>().notNull(),
      at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [systemAccess("platform_audit"), index().on(t.at), index().on(t.target, t.action, t.at)],
  )
  .enableRLS()

export type PlatformAuditRow = typeof platformAudit.$inferSelect

export function capDetails(details: Record<string, unknown>): Record<string, unknown> {
  const text = JSON.stringify(details)
  return text.length <= AUDIT_DETAILS_MAX_BYTES ? details : { truncated: true, preview: text.slice(0, AUDIT_DETAILS_MAX_BYTES) }
}

export async function recordPlatformAudit(entry: {
  actor: string
  action: string
  target: string
  details?: Record<string, unknown>
}): Promise<void> {
  await q((tx) => tx.insert(platformAudit).values({ ...entry, details: capDetails(entry.details ?? {}) }))
}

export async function platformAuditPage(skip: number, limit: number): Promise<{ rows: PlatformAuditRow[]; total: number }> {
  return q(async (tx) => {
    const rows = await tx.select().from(platformAudit).orderBy(desc(platformAudit.at)).offset(skip).limit(limit)
    const [{ n }] = await tx.select({ n: count() }).from(platformAudit)
    return { rows, total: n }
  })
}

// When a target last entered a status, read from the audit trail rather than a
// column, so the shadow clock cannot be reset without leaving a record.
export async function lastEnteredStatus(target: string, status: string): Promise<Date | null> {
  const rows = await q((tx) =>
    tx
      .select({ at: platformAudit.at })
      .from(platformAudit)
      .where(
        and(
          eq(platformAudit.target, target),
          eq(platformAudit.action, "status_changed"),
          sql`${platformAudit.details}->>'to' = ${status}`,
        ),
      )
      .orderBy(desc(platformAudit.at))
      .limit(1),
  )
  return rows[0]?.at ?? null
}
