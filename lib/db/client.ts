import { AsyncLocalStorage } from "node:async_hooks"
import { sql } from "drizzle-orm"
import { pgPolicy, pgRole, pgSchema } from "drizzle-orm/pg-core"
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { env } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { DB_POOL_MAX } from "./limits"

export const app = pgSchema("app")
export const appRole = pgRole("pushguard_app").existing()
export const systemRole = pgRole("pushguard_system").existing()

// Webhooks and jobs act for no single user. Explicit per table, rather than
// BYPASSRLS, so a table with no policies stays closed even to them.
export const systemAccess = (table: string) =>
  pgPolicy(`${table}_system`, { for: "all", to: systemRole, using: sql`true`, withCheck: sql`true` })

type Database = PostgresJsDatabase
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0]

type Identity = { role: "pushguard_app"; login: string } | { role: "pushguard_system"; login: "" }

const identity = new AsyncLocalStorage<Identity>()
const cache = globalThis as unknown as { _pushguardDb?: Database }

// prepare: false because Supavisor's transaction mode cannot hold prepared
// statements. Notices are logged: realtime.send reports a refused broadcast only as one.
function database(): Database {
  const onnotice = (notice: { message?: string; code?: string }) =>
    logger.warn("pg_notice", { code: notice.code, message: notice.message })
  cache._pushguardDb ??= drizzle(postgres(env().DATABASE_URL, { max: DB_POOL_MAX, prepare: false, onnotice }), {
    casing: "snake_case",
  })
  return cache._pushguardDb
}

export function withUser<T>(login: string, fn: () => Promise<T>): Promise<T> {
  return identity.run({ role: "pushguard_app", login: login.toLowerCase() }, fn)
}

// Bypasses row-level security. Who may import it is listed in CLAUDE.md and
// enforced by a lint rule.
export function asSystem<T>(fn: () => Promise<T>): Promise<T> {
  return identity.run({ role: "pushguard_system", login: "" }, fn)
}

// The connecting role owns nothing and inherits nothing, so a statement that
// skipped this switch is denied rather than run with someone else's rights.
export function q<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const who = identity.getStore()
  if (!who) throw new AppError("internal", "Database used outside withUser or asSystem")
  return database().transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('role', ${who.role}, true), set_config('app.login', ${who.login}, true)`,
    )
    return fn(tx)
  })
}

export function currentLogin(): string | null {
  const who = identity.getStore()
  return who?.role === "pushguard_app" ? who.login : null
}
