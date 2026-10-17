import assert from "node:assert/strict"
import { test } from "node:test"
import { blankRow, draftToRule, ruleToDraft, serverErrors } from "@/lib/rules/draft"
import { slugify, summarize } from "@/lib/rules/summary"
import { catalogRules } from "@/lib/rules/catalog"
import type { Rule } from "@/schemas/rule"

test("every catalog rule survives a round trip through the editor", () => {
  for (const rule of catalogRules) {
    const { rule: back, errors } = draftToRule(ruleToDraft(rule))
    assert.deepEqual(errors, {}, rule.id)
    assert.deepEqual(back, rule, rule.id)
  }
})

test("one group writes top-level fields, several write any_of only", () => {
  const draft = ruleToDraft({ id: "x", severity: "high", enabled: true, paths: ["a"], added_lines: ["p"] } as Rule)
  assert.equal(draftToRule(draft).rule?.added_lines, "p")
  const two = { ...draft, groups: [...draft.groups, ...ruleToDraft({ id: "y", severity: "low", enabled: true, commit_message: ["a", "b"] } as Rule).groups] }
  const rule = draftToRule(two).rule!
  assert.equal(rule.paths, undefined)
  assert.deepEqual(rule.any_of, [{ paths: ["a"], added_lines: "p" }, { commit_message: ["a", "b"] }])
})

test("top-level conditions become group one ahead of any_of", () => {
  const draft = ruleToDraft({ id: "x", severity: "high", enabled: true, paths: ["a"], any_of: [{ unicode_risk: "controls" }] } as Rule)
  assert.equal(draft.groups.length, 2)
  assert.equal(draft.groups[1].rows[0].field, "unicode_risk")
})

test("empty groups and bad regex are reported where they are", () => {
  const draft = ruleToDraft({ id: "x", severity: "high", enabled: true, added_lines: ["ok", "(bad"] } as Rule)
  draft.groups.push({ key: "g", rows: [] })
  const { rule, errors } = draftToRule(draft)
  assert.equal(rule, undefined)
  assert.ok(errors["g0.added_lines.1"])
  assert.ok(errors.g1)
})

test("an untouched empty row is dropped instead of blocking save", () => {
  const draft = ruleToDraft({ id: "x", severity: "high", enabled: true, paths: ["a"] } as Rule)
  draft.groups[0].rows.push(blankRow("added_lines"))
  const { rule, errors } = draftToRule(draft)
  assert.deepEqual(errors, {})
  assert.deepEqual(rule?.paths, ["a"])
  draft.groups[0].rows = [blankRow("added_lines")]
  assert.equal(draftToRule(draft).errors.g0, "Add a value")
})

test("server issue paths map to chips", () => {
  assert.deepEqual(serverErrors("rule.any_of.1.added_lines.0: Unsafe; rule.commit_message: Unsafe too"), {
    "g1.added_lines.0": "Unsafe",
    "g0.commit_message.0": "Unsafe too",
  })
  assert.equal(serverErrors("Rule id already exists: x"), null)
})

test("summary and slug", () => {
  assert.equal(summarize({ id: "x", severity: "high", enabled: true, paths: ["**/package.json"], added_lines: ["a", "b"] } as Rule), "File path matches **/package.json · New code: 2 patterns")
  assert.equal(summarize({ id: "x", severity: "high", enabled: true, added_lines: "preinstall" } as Rule), "New code contains preinstall")
  assert.equal(slugify("  Watch the Auth module! "), "watch-the-auth-module")
})
