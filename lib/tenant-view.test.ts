import assert from "node:assert/strict"
import { test } from "node:test"
import { navLinks, onboardingStep } from "@/lib/dashboard-state"
import { AppError } from "@/lib/errors"
import { ALL_ORGS, authorizeOrg, buildTenantView } from "@/lib/tenant-view"

const view = (over: Partial<Parameters<typeof buildTenantView>[0]> = {}) =>
  buildTenantView({
    login: "alice",
    memberships: [
      { org: "alice", role: "admin" },
      { org: "Acme", role: "member" },
      { org: "uninstalled", role: "admin" },
    ],
    installations: [
      { org: "Acme", installationId: 1 },
      { org: "alice", installationId: 2 },
      { org: "partner", installationId: 3 },
    ],
    reachedInstallationIds: [1, 3],
    ...over,
  })

const code = (fn: () => unknown) => {
  try {
    fn()
  } catch (error) {
    return (error as AppError).code
  }
  return "ok"
}

test("roles come from memberships; an installation reached only by repo access has no role", () => {
  const v = view()
  assert.deepEqual(
    v.orgs.map((o) => [o.org, o.role]),
    [["Acme", "member"], ["alice", "admin"], ["partner", null]],
  )
  assert.deepEqual(v.pendingOrgs, ["uninstalled"])
})

test("an installation with no repo access rows yet is syncing", () => {
  const v = view()
  assert.equal(v.orgs.find((o) => o.org === "alice")?.syncing, true)
  assert.equal(v.orgs.find((o) => o.org === "Acme")?.syncing, false)
})

test("the personal account is preferred, the cookie wins when it names a visible org", () => {
  assert.equal(view().current?.org, "alice")
  assert.equal(view({ preferred: "partner" }).current?.org, "partner")
  assert.equal(view({ preferred: "someone-else" }).current?.org, "alice")
  assert.equal(view({ preferred: ALL_ORGS }).allOrgs, true)
})

test("an org the user cannot see is not_found, never forbidden", () => {
  assert.equal(code(() => authorizeOrg(view(), "read", "victim-org")), "not_found")
  assert.equal(code(() => authorizeOrg(view(), "admin", "victim-org")), "not_found")
})

test("members and collaborators read; only admins pass the admin guard", () => {
  assert.equal(code(() => authorizeOrg(view(), "read", "acme")), "ok")
  assert.equal(code(() => authorizeOrg(view(), "admin", "Acme")), "forbidden")
  assert.equal(code(() => authorizeOrg(view(), "admin", "partner")), "forbidden")
  assert.equal(authorizeOrg(view(), "admin", "alice").role, "admin")
})

test("no installation at all: no current org, and the guard answers not_found", () => {
  const v = view({ installations: [], reachedInstallationIds: [] })
  assert.equal(v.current, null)
  assert.equal(code(() => authorizeOrg(v, "read")), "not_found")
})

test("onboarding follows role and sync progress", () => {
  const none = { synced: 0, total: 0 }
  assert.equal(onboardingStep(view({ installations: [], reachedInstallationIds: [] }), none, false), "install")
  assert.equal(onboardingStep(view(), none, false), "sync")
  assert.equal(onboardingStep(view({ preferred: "Acme" }), { synced: 1, total: 9 }, false), null)
  const admin = view({ reachedInstallationIds: [1, 2, 3] })
  assert.equal(onboardingStep(admin, { synced: 3, total: 9 }, false), "sync")
  assert.equal(onboardingStep(admin, { synced: 3, total: 9 }, true), null)
  assert.equal(onboardingStep(admin, { synced: 9, total: 9 }, false), null)
})

test("rules nav needs a role, AI nav needs admin", () => {
  assert.equal(navLinks(null).some((l) => l.label === "Rules"), false)
  assert.equal(navLinks("member").some((l) => l.label === "AI"), false)
  assert.ok(["Rules", "AI", "Settings"].every((label) => navLinks("admin").some((l) => l.label === label)))
})

test("overview leads the nav and alerts have their own page", () => {
  const links = navLinks("member")
  assert.deepEqual(links[0], { href: "/dashboard", label: "Overview" })
  assert.ok(links.some((l) => l.href === "/dashboard/alerts" && l.label === "Alerts"))
})
