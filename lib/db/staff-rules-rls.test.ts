import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import { sql } from "drizzle-orm"

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

const ORG = "rlssr-acme"

const denied = (error: unknown) => {
  const e = error as { message?: string; cause?: { message?: string } }
  return /permission denied|row-level security/.test(e.cause?.message ?? e.message ?? "")
}

// Runs against a real Postgres; skipped without one.
describe("staff rule tables row-level security", { skip: url ? false : "TEST_DATABASE_URL not set" }, () => {
  let db: typeof import("@/lib/db")
  let client: typeof import("@/lib/db/client")

  before(async () => {
    db = await import("@/lib/db")
    client = await import("@/lib/db/client")
    await db.asSystem(async () => {
      await client.q(async (tx) => {
        await tx.execute(sql`delete from app.platform_rules where id like 'rlssr-%'`)
        await tx.execute(sql`delete from app.check_scripts where id like 'rlssr-%'`)
      })
      await db.upsertOrgMember(ORG, "rlssr-alice", "admin")
      for (const [id, status] of [["rlssr-live", "published"], ["rlssr-shadow", "shadow"], ["rlssr-internal", "internal"], ["rlssr-draft", "draft"]] as const) {
        await db.insertPlatformRule({ id, version: 1, body: {} as never, status, createdBy: "staff" })
        await db.insertCheckScript({ id, version: 1, language: "sh", body: "true", sha256: "0".repeat(64), status, createdBy: "staff" })
      }
    })
  })

  after(async () => {
    const pg = (globalThis as unknown as { _pushguardDb?: { $client: { end: () => Promise<void> } } })._pushguardDb
    await pg?.$client.end()
  })

  test("users read only published staff rules and cannot write any", async () => {
    const ids = (await db.withUser("rlssr-alice", () => db.runnablePlatformRules())).map((r) => r.id).filter((id) => id.startsWith("rlssr-"))
    assert.deepEqual(ids, ["rlssr-live"])
    const system = (await db.asSystem(() => db.runnablePlatformRules())).map((r) => r.id).filter((id) => id.startsWith("rlssr-")).sort()
    assert.deepEqual(system, ["rlssr-internal", "rlssr-live", "rlssr-shadow"])
    await assert.rejects(() => db.withUser("rlssr-alice", () => db.insertPlatformRule({ id: "rlssr-forged", version: 1, body: {} as never, status: "published", createdBy: "x" })), denied)
  })

  test("shadow hits and check bodies are closed to users; published check ids are not", async () => {
    await assert.rejects(() => db.withUser("rlssr-alice", () => db.shadowHitsFor("rlssr-live", 1, 10)), denied)
    await assert.rejects(() => db.withUser("rlssr-alice", () => db.publishedCheckScript("rlssr-live")), denied)
    const ids = (await db.withUser("rlssr-alice", () => db.publishedCheckIds())).filter((id) => id.startsWith("rlssr-"))
    assert.deepEqual(ids, ["rlssr-live"])
  })
})
