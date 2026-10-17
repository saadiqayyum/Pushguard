import assert from "node:assert/strict"
import { test } from "node:test"
import { fromGlob, fromRegex, OPERATORS, toGlob, toRegex } from "@/lib/rules/operators"
import { catalogRules } from "@/lib/rules/catalog"

test("each text operator compiles to a regex that reads back the same", () => {
  for (const op of OPERATORS.filter((o) => o !== "matches")) {
    for (const value of ["preinstall", "curl -s http://x.y", "a.b(c)", "$HOME/.ssh"]) {
      assert.deepEqual(fromRegex(toRegex({ op, value })), { op, value }, `${op} ${value}`)
    }
  }
})

test("literals are escaped, so text never acts as a pattern", () => {
  const re = new RegExp(toRegex({ op: "contains", value: "a.b" }))
  assert.equal(re.test("a.b"), true)
  assert.equal(re.test("axb"), false)
  assert.equal(new RegExp(toRegex({ op: "starts_with", value: "eval(" })).test("  eval(x)"), false)
  assert.equal(new RegExp(toRegex({ op: "ends_with", value: "| sh" })).test("curl x | sh"), true)
})

test("a real regex stays a regex", () => {
  assert.equal(fromRegex('"(pre|post)install"\\s*:').op, "matches")
  assert.equal(fromRegex("^\\s*eval\\(").op, "matches")
})

test("each path operator compiles to a glob that reads back the same", () => {
  for (const [op, value] of [
    ["equals", "package.json"],
    ["starts_with", ".github/workflows"],
    ["ends_with", ".lock"],
    ["contains", "secret"],
  ] as const) {
    assert.deepEqual(fromGlob(toGlob({ op, value })), { op, value }, `${op} ${value}`)
  }
  assert.equal(fromGlob("**/package.json").op, "matches")
})

test("every shipped pattern survives a round trip through the editor", () => {
  for (const rule of catalogRules) {
    for (const source of [rule.added_lines, rule.commit_message].flat()) {
      if (!source) continue
      assert.equal(toRegex(fromRegex(source)), source, `${rule.id}: ${source}`)
    }
    for (const glob of rule.paths ?? []) assert.equal(toGlob(fromGlob(glob)), glob, `${rule.id}: ${glob}`)
  }
})
