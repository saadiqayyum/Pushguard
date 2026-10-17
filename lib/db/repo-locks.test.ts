import assert from "node:assert/strict"
import { after, describe, test } from "node:test"

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

// Runs against a real Postgres (npm run db:local); skipped without one.
describe("repository lease lock", { skip: url ? false : "TEST_DATABASE_URL not set" }, () => {
  const repo = "lock-test/repo"
  after(async () => {
    const db = await import("@/lib/db")
    await db.asSystem(() => db.releaseRepoLock(repo, "first"))
  })

  test("one holder at a time, re-entrant, free after release or expiry", async () => {
    const db = await import("@/lib/db")
    await db.asSystem(async () => {
      assert.equal(await db.takeRepoLock(repo, "first", 60), true)
      assert.equal(await db.takeRepoLock(repo, "second", 60), false)
      assert.equal(await db.takeRepoLock(repo, "first", 60), true)
      await db.releaseRepoLock(repo, "second")
      assert.equal(await db.takeRepoLock(repo, "second", 60), false)
      await db.releaseRepoLock(repo, "first")
      assert.equal(await db.takeRepoLock(repo, "second", 0), true)
      assert.equal(await db.takeRepoLock(repo, "first", 60), true)
    })
  })
})
