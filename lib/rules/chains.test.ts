import assert from "node:assert/strict"
import { test } from "node:test"
import {
  confirmContentMatches,
  erasedLines,
  erasureRules,
  evaluateRules,
  type PushContext,
} from "@/lib/engine"
import { catalogRules } from "@/lib/rules/catalog"
import { CHAINS } from "@/lib/rules/fixtures/chains"
import { byFile } from "@/lib/rules/fixtures/lines"
import type { FileLines } from "@/lib/diff-lines"
import type { Rule } from "@/schemas/rule"

const enabled = catalogRules.filter((rule) => rule.enabled)
const disabled = catalogRules.filter((rule) => !rule.enabled)

const fired = (rules: Rule[], context: PushContext, lines: FileLines) =>
  [...new Set(confirmContentMatches(evaluateRules(rules, context), lines).map((m) => m.rule.id))].sort()

for (const chain of CHAINS) {
  for (const [i, step] of chain.steps.entries()) {
    const { context } = step
    if (!context) continue
    const name = `${chain.id} step ${i + 1}: ${step.label}`

    test(name, () => {
      const lines = byFile(step.addedLines ?? [], context)
      assert.deepEqual(fired(enabled, context, lines), [...(step.fires ?? [])].sort())
      if (step.firesWhenEnabled) {
        assert.deepEqual(fired(disabled, context, lines), [...step.firesWhenEnabled].sort())
      }
      if (step.erased) {
        const orphanContext = { ...context, files: chain.steps[i - 1].context!.files, unreviewed: null }
        const gone = erasedLines(byFile(step.erased.orphaned, orphanContext), byFile(step.erased.surviving, context))
        assert.deepEqual(fired(erasureRules(enabled), orphanContext, gone), [...step.erased.fires].sort())
      }
    })
  }
  for (const capability of chain.todo ?? []) test.todo(`${chain.id} chain: ${capability}`)
}

test("the catalogue's 27 fixtures are all present", () => {
  assert.equal(CHAINS.length, 27)
  assert.equal(new Set(CHAINS.map((c) => c.id)).size, 27)
})
