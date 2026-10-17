import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import { getTableName, is, sql } from "drizzle-orm"
import { PgTable } from "drizzle-orm/pg-core"
import { ORG_TABLES } from "./org-data"
import * as schema from "./schema"

const url = process.env.TEST_DATABASE_URL
Object.assign(process.env, {
  DATABASE_URL: url ?? "postgres://unused",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----",
  GITHUB_WEBHOOK_SECRET: "w".repeat(16),
  CRON_SECRET: "c".repeat(32),
  AUTH_SECRET: "a".repeat(16),
  AUTH_GITHUB_ID: "id",
  AUTH_GITHUB_SECRET: "secret",
  AUTH_URL: "http://localhost:3000",
})

const GLOBAL = [
  "action_pin_verdicts",
  "check_scripts",
  "contributor_drafts",
  "deliveries",
  "malicious_packages",
  "platform_audit",
  "platform_rules",
  "rate_limits",
  "threat_actors",
  "threat_indicators",
  "users",
]

test("every table is either deleted with its org or listed as global", () => {
  const tables = Object.values(schema).filter((value) => is(value, PgTable)).map((t) => getTableName(t as PgTable))
  const scoped = ORG_TABLES.map(([table]) => getTableName(table))
  assert.deepEqual(tables.filter((t) => !scoped.includes(t) && !GLOBAL.includes(t)), [])
})

const A = "od-a-org"
const B = "od-b-org"

type Column = { column_name: string; data_type: string; is_nullable: string; column_default: string | null }

// A placeholder for every required column, so the test follows the schema without a fixture per table.
function filler(c: Column): string {
  if (c.data_type === "ARRAY") return "'{}'"
  if (c.data_type === "jsonb") return "'{}'::jsonb"
  if (c.data_type === "boolean") return "false"
  if (c.data_type === "uuid") return "gen_random_uuid()"
  if (c.data_type === "date") return "current_date"
  if (c.data_type.startsWith("timestamp")) return "now()"
  if (["integer", "bigint", "smallint"].includes(c.data_type)) return String(Math.floor(Math.random() * 1e9) + 1)
  return "md5(random()::text)"
}

// Against a real Postgres (npm run db:local or TEST_DATABASE_URL); skipped without one.
describe("deleteOrgData", { skip: url ? false : "TEST_DATABASE_URL not set" }, () => {
  let db: typeof import("@/lib/db")
  let client: typeof import("@/lib/db/client")

  const count = (org: string) =>
    db.asSystem(() =>
      client.q(async (tx) => {
        const counts: Record<string, number> = {}
        for (const [table, column, key] of ORG_TABLES) {
          const name = getTableName(table)
          const match = key === "org" ? sql`${sql.identifier(column.name)} = ${org}` : sql`${sql.identifier(column.name)} like ${`${org}/%`}`
          const rows = await tx.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.raw(`app.${name}`)} where ${match}`)
          counts[name] = rows[0].n
        }
        return counts
      }),
    )

  before(async () => {
    db = await import("@/lib/db")
    client = await import("@/lib/db/client")
    await db.asSystem(async () => {
      await db.deleteOrgData(A)
      await db.deleteOrgData(B)
      await client.q(async (tx) => {
        for (const [table, column, key] of ORG_TABLES) {
          const name = getTableName(table)
          const columns = await tx.execute<Column>(
            sql`select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'app' and table_name = ${name}`,
          )
          for (const org of [A, B]) {
            const required = columns.filter((c) => c.is_nullable === "NO" && c.column_default === null)
            const chosen = required.some((c) => c.column_name === column.name) ? required : [...required, columns.find((c) => c.column_name === column.name)!]
            const values = chosen.map((c) =>
              c.column_name === column.name ? `'${key === "org" ? org : `${org}/repo`}'` : ["repo", "full_name"].includes(c.column_name) ? `'${org}/repo'` : c.column_name === "org" ? `'${org}'` : filler(c),
            )
            await tx.execute(sql.raw(`insert into app.${name} (${chosen.map((c) => `"${c.column_name}"`).join(", ")}) values (${values.join(", ")})`))
          }
        }
      })
    })
  })

  after(async () => {
    await db.asSystem(async () => {
      await db.deleteOrgData(A)
      await db.deleteOrgData(B)
    })
    const pg = (globalThis as unknown as { _pushguardDb?: { $client: { end: () => Promise<void> } } })._pushguardDb
    await pg?.$client.end()
  })

  test("removes every row of one org and none of another", async () => {
    const before = await count(B)
    assert.ok(Object.values(await count(A)).every((n) => n === 1))
    const deleted = await db.asSystem(() => db.deleteOrgData(A))
    assert.ok(Object.values(deleted).every((n) => n === 1))
    assert.ok(Object.values(await count(A)).every((n) => n === 0))
    assert.deepEqual(await count(B), before)
  })

  test("a second run deletes nothing", async () => {
    const deleted = await db.asSystem(() => db.deleteOrgData(A))
    assert.ok(Object.values(deleted).every((n) => n === 0))
  })

  test("the app role cannot delete an org's data", async () => {
    await assert.rejects(() => db.withUser("od-someone", () => db.deleteOrgData(B)))
  })
})
