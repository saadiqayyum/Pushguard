import assert from "node:assert/strict"
import { test } from "node:test"
import { checkRegexSafety, checkedRuleSchema } from "@/schemas/rule-safety"
import { catalogRules as defaultRules } from "@/lib/rules/catalog"

test("the pattern that hung the scanner is rejected", async () => {
  // Measured on this codebase: >30s on a 60-character line, well inside the
  // 2000-character scan cap. A push carrying that line is never evaluated.
  const verdict = await checkRegexSafety("(\\w+\\s?)+=")
  assert.equal(verdict.ok, false)
  assert.match(verdict.ok === false ? verdict.reason : "", /exponential/)
})

test("classic catastrophic backtracking is rejected", async () => {
  assert.equal((await checkRegexSafety("(a+)+$")).ok, false)
})

test("every rule Pushguard ships is accepted", async () => {
  // The reason redos-detector was not used: it rejected two of these while
  // saying nothing different about the dangerous one above.
  for (const rule of defaultRules) {
    for (const source of [rule.added_lines, rule.commit_message]) {
      if (!source) continue
      assert.equal((await checkRegexSafety(source)).ok, true, `${rule.id}: /${source}/ was rejected`)
    }
  }
})

test("a rule carrying an unsafe regex cannot be saved", async () => {
  const result = await checkedRuleSchema.safeParseAsync({
    id: "hangs-the-scanner",
    severity: "high",
    added_lines: "(a+)+$",
  })
  assert.equal(result.success, false)
  assert.equal(result.error?.issues[0].path[0], "added_lines")
})

test("commit_message is checked too, not only added_lines", async () => {
  const result = await checkedRuleSchema.safeParseAsync({
    id: "hangs-on-messages",
    severity: "high",
    commit_message: "(a+)+$",
  })
  assert.equal(result.success, false)
  assert.equal(result.error?.issues[0].path[0], "commit_message")
})
