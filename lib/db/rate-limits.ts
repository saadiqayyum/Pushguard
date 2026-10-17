import { sql } from "drizzle-orm"
import { integer, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import { app, q, systemAccess } from "./client"

export const rateLimits = app
  .table(
    "rate_limits",
    {
      key: text().notNull(),
      windowStart: timestamp({ withTimezone: true }).notNull(),
      count: integer().notNull().default(1),
    },
    (t) => [systemAccess("rate_limits"), primaryKey({ columns: [t.key, t.windowStart] })],
  )
  .enableRLS()

// Fixed window. Goes through app.hit_rate_limit, a security-definer function,
// because the app role has no rights on the table: a limit counts every caller.
export async function hit(key: string, windowSec: number): Promise<{ count: number; resetIn: number }> {
  const rows = await q((tx) =>
    tx.execute<{ count: number; reset_in: number }>(sql`select * from app.hit_rate_limit(${key}, ${windowSec})`),
  )
  const row = rows[0]
  return { count: Number(row?.count ?? 1), resetIn: Number(row?.reset_in ?? windowSec) }
}
