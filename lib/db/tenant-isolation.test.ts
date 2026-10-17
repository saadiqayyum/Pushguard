import assert from "node:assert/strict"
import { after, before, describe, test } from "node:test"
import { sql } from "drizzle-orm"
import { authorizeOrg, buildTenantView } from "@/lib/tenant-view"

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

const A = "xt-a-org"
const B = "xt-b-org"
const RULE = { id: "xt-rule", severity: "high", description: "d", paths: ["a"] } as never
const page = { skip: 0, perPage: 50 }

// The same reads lib/tenant.ts makes, minus the cookie.
describe("cross-tenant isolation", { skip: url ? false : "TEST_DATABASE_URL not set" }, () => {
  let db: typeof import("@/lib/db")
  let client: typeof import("@/lib/db/client")

  const tenantOf = (login: string) =>
    db.withUser(login, async () => {
      const memberships = await db.membershipsOf(login)
      const reached = await db.accessibleInstallationIds(login)
      const installations = await db.reachableInstallations(memberships.map((m) => m.org), reached)
      return buildTenantView({ login, memberships, installations, reachedInstallationIds: reached })
    })

  before(async () => {
    db = await import("@/lib/db")
    client = await import("@/lib/db/client")
    await db.asSystem(async () => {
      await client.q(async (tx) => {
        for (const [table, column] of [
          ["alerts", "repo"],
          ["repo_access", "repo"],
          ["rules", "org"],
          ["org_members", "org"],
          ["scans", "account"],
          ["installations", "org"],
        ]) {
          await tx.execute(sql.raw(`delete from app.${table} where ${column} like 'xt-%'`))
        }
      })
      await db.registerInstallation({ org: A, installationId: 9101, accountType: "Organization", installedBy: "xt-alice" })
      await db.registerInstallation({ org: B, installationId: 9102, accountType: "Organization", installedBy: "xt-bea" })
      await db.upsertOrgMember(A, "xt-alice", "admin")
      await db.upsertOrgMember(A, "xt-mo", "member")
      await db.upsertOrgMember(B, "xt-bea", "admin")
      await db.grantRepoAccess("xt-alice", `${A}/api`, 9101, "collaborator")
      await db.grantRepoAccess("xt-mo", `${A}/api`, 9101, "collaborator")
      await db.grantRepoAccess("xt-bea", `${B}/web`, 9102, "collaborator")
      await db.recordAlert({
        repo: `${A}/api`,
        number: 7,
        url: "https://example.test",
        title: "t",
        severity: "high",
        ruleIds: ["force-push"],
        findings: [],
        source: "push",
        createdAt: new Date(),
      })
      await db.insertScan({
        id: "xt-scan",
        owner: "xt-alice",
        target: A,
        scope: "org",
        status: "done",
        installationId: 9101,
        account: A,
      })
    })
  })

  after(async () => {
    const pg = (globalThis as unknown as { _pushguardDb?: { $client: { end: () => Promise<void> } } })._pushguardDb
    await pg?.$client.end()
  })

  test("a member reads rules but cannot write them through the lib functions", async () => {
    await db.withUser("xt-alice", () => db.saveRule(A, "xt-rule", { body: RULE, enabled: true, createdBy: "xt-alice" }))
    assert.equal((await db.withUser("xt-mo", () => db.rulesFor(A))).length, 1)
    await assert.rejects(() =>
      db.withUser("xt-mo", () => db.saveRule(A, "xt-rule", { body: RULE, enabled: false, createdBy: "xt-mo" })),
    )
    assert.equal(await db.withUser("xt-mo", () => db.deleteRule(A, "xt-rule")), false)
    await assert.rejects(() => db.withUser("xt-mo", () => db.setPackDisabled(A, "core", true, "xt-mo")))
  })

  test("the guard gives a member read and refuses admin", async () => {
    const view = await tenantOf("xt-mo")
    assert.equal(authorizeOrg(view, "read", A).role, "member")
    assert.throws(() => authorizeOrg(view, "admin", A), /Only owners/)
  })

  test("another org's admin sees neither the org nor its rules", async () => {
    const view = await tenantOf("xt-bea")
    assert.deepEqual(view.orgs.map((o) => o.org), [B])
    assert.throws(() => authorizeOrg(view, "read", A), /not found/)
    assert.equal((await db.withUser("xt-bea", () => db.rulesFor(A))).length, 0)
    assert.equal((await db.withUser("xt-bea", () => db.reachableInstallations([A], [9101]))).length, 0)
  })

  test("user B gets nothing for user A's alerts", async () => {
    const key = { repo: `${A}/api`, number: 7 }
    await db.withUser("xt-bea", async () => {
      assert.equal((await db.listAlerts("xt-bea", [A], page)).alerts.length, 0)
      assert.equal((await db.listAlerts("xt-alice", [A], page)).alerts.length, 0)
      assert.equal(await db.alertDetail("xt-bea", key.repo, key.number), null)
      assert.equal(await db.alertDetail("xt-alice", key.repo, key.number), null)
      assert.equal((await db.alertsByIds("xt-bea", [key])).length, 0)
      assert.equal(await db.setAlertsArchived("xt-bea", [key], true), 0)
    })
    assert.ok(await db.withUser("xt-alice", () => db.alertDetail("xt-alice", key.repo, key.number)))
  })

  test("user B gets nothing for user A's scans, even by id", async () => {
    await db.withUser("xt-bea", async () => {
      assert.equal(await db.readableScan("xt-scan", "xt-bea"), null)
      assert.equal(await db.readableScan("xt-scan", "xt-alice"), null)
      assert.equal((await db.scansPage("xt-alice", page)).rows.length, 0)
    })
    assert.equal((await db.withUser("xt-mo", () => db.scansPage("xt-alice", page))).total, 0)
    assert.ok(await db.withUser("xt-alice", () => db.readableScan("xt-scan", "xt-alice")))
  })

  test("a member cannot add or list model keys", async () => {
    assert.equal((await db.withUser("xt-mo", () => db.publicAiKeys(A))).length, 0)
    await assert.rejects(() =>
      db.withUser("xt-mo", () =>
        db.insertAiKey({
          id: "xt-key",
          org: A,
          label: "k",
          provider: "anthropic",
          keyHint: "h",
          model: "m",
          effort: "low",
          baseUrl: null,
          ciphertext: "c",
          iv: "i",
          tag: "t",
          addedBy: "xt-mo",
          addedAt: new Date(),
        }),
      ),
    )
  })
})
