import { and, asc, eq, sql } from "drizzle-orm"
import { pgPolicy, text, timestamp } from "drizzle-orm/pg-core"
import { app, appRole, q, systemAccess } from "./client"

// Out-of-band alert destinations. Sealed like model keys: the app role is
// granted every column but the three sealed ones.
export const alertSinks = app
  .table(
    "alert_sinks",
    {
      id: text().primaryKey(),
      org: text().notNull(),
      label: text().notNull(),
      host: text().notNull(),
      hint: text().notNull(),
      ciphertext: text().notNull(),
      iv: text().notNull(),
      tag: text().notNull(),
      createdBy: text().notNull(),
      createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    () => [
      systemAccess("alert_sinks"),
      pgPolicy("alert_sinks_admin", {
        for: "all",
        to: appRole,
        using: sql`authz.is_admin(org)`,
        withCheck: sql`authz.is_admin(org)`,
      }),
    ],
  )
  .enableRLS()

export type SealedSink = typeof alertSinks.$inferSelect

const publicColumns = {
  id: alertSinks.id,
  label: alertSinks.label,
  host: alertSinks.host,
  hint: alertSinks.hint,
  createdAt: alertSinks.createdAt,
}

export async function sinksFor(org: string) {
  return q((tx) => tx.select(publicColumns).from(alertSinks).where(eq(alertSinks.org, org)).orderBy(asc(alertSinks.createdAt)))
}

export async function countSinks(org: string): Promise<number> {
  const rows = await q((tx) => tx.select({ n: sql<number>`count(*)::int` }).from(alertSinks).where(eq(alertSinks.org, org)))
  return rows[0]?.n ?? 0
}

export async function insertSink(sink: SealedSink): Promise<void> {
  await q((tx) => tx.insert(alertSinks).values(sink))
}

export async function deleteSink(org: string, id: string): Promise<boolean> {
  const rows = await q((tx) =>
    tx.delete(alertSinks).where(and(eq(alertSinks.org, org), eq(alertSinks.id, id))).returning({ id: alertSinks.id }),
  )
  return rows.length > 0
}

// System context only: the app role cannot read the sealed columns.
export async function sealedSinks(org: string): Promise<SealedSink[]> {
  return q((tx) => tx.select().from(alertSinks).where(eq(alertSinks.org, org)))
}
