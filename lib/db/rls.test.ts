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

const ORG = "rls-acme"

const denied = (error: unknown) => {
  const e = error as { message?: string; cause?: { message?: string } }
  return /permission denied/.test(e.cause?.message ?? e.message ?? "")
}
const OTHER = "rls-other"

// Runs against a real Postgres (npm run db:local); skipped without one.
describe("row-level security", { skip: url ? false : "TEST_DATABASE_URL not set" }, () => {
  let db: typeof import("@/lib/db")
  let client: typeof import("@/lib/db/client")

  before(async () => {
    db = await import("@/lib/db")
    client = await import("@/lib/db/client")
    await db.asSystem(async () => {
      await client.q(async (tx) => {
        for (const table of ["alerts", "rules", "org_members", "repo_access", "scans", "ai_keys"]) {
          await tx.execute(sql.raw(`delete from app.${table} where ${table === "alerts" || table === "repo_access" ? "repo" : table === "scans" ? "account" : "org"} like 'rls-%'`))
        }
      })
      await db.upsertOrgMember(ORG, "alice", "admin")
      await db.upsertOrgMember(ORG, "bob", "member")
      await db.upsertOrgMember(OTHER, "carol", "admin")
      await db.grantRepoAccess("bob", `${ORG}/web`, 1, "collaborator")
      await db.grantRepoAccess("carol", `${OTHER}/x`, 2, "collaborator")
      for (const repo of [`${ORG}/web`, `${ORG}/secret`, `${OTHER}/x`]) {
        await db.recordAlert({
          repo,
          number: 1,
          url: "https://example.test",
          title: "t",
          severity: "high",
          ruleIds: ["force-push"],
          findings: [],
          source: "push",
          createdAt: new Date(),
        })
      }
      await db.insertAiKey({
        id: "rls-key",
        org: ORG,
        label: "k",
        provider: "anthropic",
        keyHint: "sk-...abcd",
        model: "m",
        effort: "low",
        baseUrl: null,
        ciphertext: "secret-bytes",
        iv: "iv",
        tag: "tag",
        addedBy: "alice",
        addedAt: new Date(),
      })
    })
  })

  after(async () => {
    const pg = (globalThis as unknown as { _pushguardDb?: { $client: { end: () => Promise<void> } } })._pushguardDb
    await pg?.$client.end()
  })

  test("a query outside withUser or asSystem is refused", async () => {
    await assert.rejects(() => db.listAlerts("bob", [], { skip: 0, perPage: 10 }), /outside withUser/)
  })

  test("an unfiltered select still returns only readable alerts", async () => {
    const repos = await db.withUser("bob", () =>
      client.q((tx) => tx.select({ repo: db.alerts.repo }).from(db.alerts).where(sql`repo like 'rls-%'`)),
    )
    assert.deepEqual(repos.map((r) => r.repo), [`${ORG}/web`])
  })

  test("asking for another user's alerts as yourself returns nothing", async () => {
    const page = await db.withUser("bob", () => db.listAlerts("carol", [], { skip: 0, perPage: 10 }))
    assert.equal(page.alerts.length, 0)
  })

  test("members read rules; only admins write them", async () => {
    const body = { id: "rls-rule", severity: "high", description: "d", paths: ["a"] } as never
    await assert.rejects(() =>
      db.withUser("bob", () => db.saveRule(ORG, "rls-rule", { body, enabled: true, createdBy: "bob" })),
    )
    await db.withUser("alice", () => db.saveRule(ORG, "rls-rule", { body, enabled: true, createdBy: "alice" }))
    assert.equal((await db.withUser("bob", () => db.rulesFor(ORG))).length, 1)
    assert.equal((await db.withUser("carol", () => db.rulesFor(ORG))).length, 0)
  })

  test("an admin of one org cannot write another org's rules", async () => {
    const body = { id: "x", severity: "high", description: "d", paths: ["a"] } as never
    await assert.rejects(() =>
      db.withUser("carol", () => db.saveRule(ORG, "x", { body, enabled: true, createdBy: "carol" })),
    )
  })

  test("the app role cannot select a sealed key, even as the org's admin", async () => {
    await assert.rejects(() => db.withUser("alice", () => db.sealedAiKey(ORG, "rls-key")), denied)
    const keys = await db.withUser("alice", () => db.publicAiKeys(ORG))
    assert.equal(keys[0]?.keyHint, "sk-...abcd")
    assert.equal(JSON.stringify(keys).includes("secret-bytes"), false)
  })

  test("a member who is not an admin sees no keys", async () => {
    assert.equal((await db.withUser("bob", () => db.publicAiKeys(ORG))).length, 0)
  })

  test("the app role cannot write to the job queue directly", async () => {
    await assert.rejects(
      () => db.withUser("alice", () => db.enqueueJob({ type: "scan", id: "forged" })),
      denied,
    )
  })

  test("anon and authenticated reach nothing in the app schema", { skip: !process.env.TEST_ADMIN_DATABASE_URL }, async () => {
    const postgres = (await import("postgres")).default
    const admin = postgres(process.env.TEST_ADMIN_DATABASE_URL!, { max: 1, onnotice: () => {} })
    try {
      for (const role of ["anon", "authenticated"]) {
        await assert.rejects(
          () => admin.begin(async (tx) => {
            await tx.unsafe(`set local role ${role}`)
            return tx.unsafe("select 1 from app.alerts limit 1")
          }),
          denied,
        )
      }
    } finally {
      await admin.end()
    }
  })
})
