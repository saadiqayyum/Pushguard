import { eq, sql } from "drizzle-orm"
import { pgPolicy, text, timestamp } from "drizzle-orm/pg-core"
import { app, appRole, q, systemAccess } from "./client"

const own = sql`login = authz.current_login()`

// One row per GitHub login: which terms version it accepted. Users reach only their own row.
export const users = app
  .table(
    "users",
    {
      login: text().primaryKey(),
      termsAcceptedAt: timestamp({ withTimezone: true }),
      termsVersion: text(),
      createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    () => [
      systemAccess("users"),
      pgPolicy("users_own_select", { for: "select", to: appRole, using: own }),
      pgPolicy("users_own_insert", { for: "insert", to: appRole, withCheck: own }),
      pgPolicy("users_own_update", { for: "update", to: appRole, using: own, withCheck: own }),
    ],
  )
  .enableRLS()

export async function termsVersionOf(login: string): Promise<string | null> {
  const rows = await q((tx) =>
    tx.select({ version: users.termsVersion }).from(users).where(eq(users.login, login.toLowerCase())).limit(1),
  )
  return rows[0]?.version ?? null
}

export async function recordTermsAcceptance(login: string, version: string): Promise<void> {
  const accepted = { termsVersion: version, termsAcceptedAt: new Date() }
  await q((tx) =>
    tx
      .insert(users)
      .values({ login: login.toLowerCase(), ...accepted })
      .onConflictDoUpdate({ target: users.login, set: accepted }),
  )
}
