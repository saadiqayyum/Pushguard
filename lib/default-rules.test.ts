import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { parse } from "yaml"
import { defaultRules } from "@/lib/default-rules"
import { rulesFileSchema } from "@/schemas/rule"

test("every default rule is valid and has a condition", () => {
  assert.ok(defaultRules.length > 0)
  for (const rule of defaultRules) {
    assert.ok(rule.paths || rule.when || rule.added_lines || rule.ai, `${rule.id} has no condition`)
  }
})

test("default rule ids are unique", () => {
  const ids = defaultRules.map((r) => r.id)
  assert.equal(new Set(ids).size, ids.length)
})

// The YAML is the documented format reference; the TS module is what actually
// ships to new installs. Anything present in both must say the same thing.
test("defaults do not drift from rules.example.yaml", () => {
  const documented = rulesFileSchema.parse(parse(readFileSync("rules.example.yaml", "utf8")))
  const byId = new Map(documented.map((r) => [r.id, r]))

  for (const rule of defaultRules) {
    const doc = byId.get(rule.id)
    assert.ok(doc, `${rule.id} is seeded but missing from rules.example.yaml`)
    assert.deepEqual(rule, doc, `${rule.id} differs between defaults and rules.example.yaml`)
  }
})

test("org-specific example rules are not seeded", () => {
  for (const rule of defaultRules) {
    assert.ok(!rule.repos, `${rule.id} is scoped to specific repos and would match nothing`)
  }
})
