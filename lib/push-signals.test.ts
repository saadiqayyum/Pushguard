import assert from "node:assert/strict"
import { test } from "node:test"
import { tagMovedFinding } from "@/lib/push-signals"
import { classifySettings } from "@/lib/webhook/settings"
import { pushPayloadSchema } from "@/schemas/webhook"

const push = (fields: Record<string, unknown>) =>
  pushPayloadSchema.parse({
    ref: "refs/tags/v1",
    before: "a".repeat(40),
    after: "b".repeat(40),
    repository: { full_name: "acme/action", owner: { login: "acme" } },
    pusher: { name: "mallory" },
    sender: { login: "mallory" },
    ...fields,
  })

test("moving an existing tag is critical", () => {
  const finding = tagMovedFinding(push({}))
  assert.equal(finding?.ruleId, "tag-moved")
  assert.equal(finding?.severity, "critical")
})

test("creating or deleting a tag, or pushing a branch, is not a move", () => {
  assert.equal(tagMovedFinding(push({ created: true, before: "0".repeat(40) })), null)
  assert.equal(tagMovedFinding(push({ deleted: true })), null)
  assert.equal(tagMovedFinding(push({ ref: "refs/heads/main" })), null)
})

const settings = (action: string, extra: Record<string, unknown> = {}) => ({
  action,
  sender: { login: "mallory" },
  repository: { full_name: "acme/web" },
  ...extra,
})

test("a writable deploy key is critical, a read-only one high", () => {
  assert.equal(classifySettings("deploy_key", settings("created", { key: { title: "ci", read_only: false } }))?.severity, "critical")
  assert.equal(classifySettings("deploy_key", settings("created", { key: { title: "ci", read_only: true } }))?.severity, "high")
  assert.equal(classifySettings("deploy_key", settings("deleted")), null)
})

test("deleting protection is critical, editing it high, creating it quiet", () => {
  assert.equal(classifySettings("branch_protection_rule", settings("deleted", { rule: { name: "main" } }))?.ruleId, "protection-deleted")
  assert.equal(classifySettings("repository_ruleset", settings("edited"))?.ruleId, "protection-weakened")
  assert.equal(classifySettings("branch_protection_rule", settings("created")), null)
})
