import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import { eq, sql } from "drizzle-orm"

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

const A = "tu-alice"
const B = "tu-bob"
const C = "tu-carol"

// Against a real Postgres (npm run db:local or TEST_DATABASE_URL); skipped without one.
describe("terms acceptance", { skip: url ? false : "TEST_DATABASE_URL not set" }, () => {
  let db: typeof import("@/lib/db")
  let client: typeof import("@/lib/db/client")
  let terms: typeof import("@/lib/terms")

  before(async () => {
    db = await import("@/lib/db")
    client = await import("@/lib/db/client")
    terms = await import("@/lib/terms")
    await db.asSystem(async () => {
      await client.q((tx) => tx.execute(sql`delete from app.users where login like 'tu-%'`))
      await db.recordTermsAcceptance(A, terms.TERMS_VERSION)
    })
  })

  after(async () => {
    await db.asSystem(() => client.q((tx) => tx.execute(sql`delete from app.users where login like 'tu-%'`)))
    const pg = (globalThis as unknown as { _pushguardDb?: { $client: { end: () => Promise<void> } } })._pushguardDb
    await pg?.$client.end()
  })

  test("a user reads their own row and not another's", async () => {
    assert.equal(await db.withUser(A, () => db.termsVersionOf(A)), terms.TERMS_VERSION)
    assert.equal(await db.withUser(B, () => db.termsVersionOf(A)), null)
    const all = await db.withUser(B, () => client.q((tx) => tx.select().from(db.users).where(sql`login like 'tu-%'`)))
    assert.deepEqual(all, [])
  })

  test("a user cannot update or insert another user's row", async () => {
    const updated = await db.withUser(B, () =>
      client.q((tx) => tx.update(db.users).set({ termsVersion: "forged" }).where(eq(db.users.login, A)).returning()),
    )
    assert.equal(updated.length, 0)
    await assert.rejects(() => db.withUser(B, () => db.recordTermsAcceptance(C, terms.TERMS_VERSION)))
    assert.equal(await db.withUser(A, () => db.termsVersionOf(A)), terms.TERMS_VERSION)
  })

  test("the guard refuses a user who has not accepted", async () => {
    await assert.rejects(() => db.withUser(B, () => terms.requireTerms(B)), (e: { code?: string }) => e.code === "terms_required")
    await db.withUser(A, () => terms.requireTerms(A))
  })

  test("accepting records the current version for the caller only", async () => {
    await assert.rejects(() => db.withUser(B, () => terms.acceptTerms(B, "1 January 2020")), (e: { code?: string }) => e.code === "validation_failed")
    await db.withUser(B, () => terms.acceptTerms(B, terms.TERMS_VERSION))
    assert.equal(await db.withUser(B, () => db.termsVersionOf(B)), terms.TERMS_VERSION)
    await db.withUser(B, () => terms.requireTerms(B))
  })
})
