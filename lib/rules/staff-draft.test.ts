import assert from "node:assert/strict"
import { test } from "node:test"
import { draftToRule, ruleToDraft } from "@/lib/rules/draft"
import { catalogRules } from "@/lib/rules/catalog"
import { joinStaffRule, splitStaffRule } from "@/lib/rules/staff-draft"
import { staffRuleSchema } from "@/schemas/staff-rule"

const fixture = (name: string, added: string) => ({
  name,
  commits: [{ files: [{ path: "index.js", change: "added" as const, added: [added] }] }],
})

const staff = staffRuleSchema.parse({
  id: "staff-sample",
  description: "Staff sample",
  severity: "critical",
  pack: "core",
  branches: ["main"],
  on: ["push"],
  any_of: [
    { paths: ["**/package.json"], added_lines: "preinstall" },
    {
      commit_message: ["a", "b"],
      when: { forced: true, hour_utc: { not_between: [9, 18] } },
    },
  ],
  advanced: {
    when: {
      all: [{ facts: { kinds: ["network", "eval"], same_file: true } }, { indicator: { campaign: "shai-hulud" } }],
    },
    within: { days: 14 },
  },
  responses: [{ investigate: { focus: "install-hook-exfil", max_tokens: 4000 } }, { detonate: { phases: ["install", "check"], check: "npm-install" } }, { meta_alert: true }],
  explanation: "# Why\n\nBecause.",
  incidents: [
    {
      name: "Incident",
      date: "2025-09",
      url: "https://example.com/a",
      note: "n",
    },
  ],
  references: [{ title: "Ref", url: "https://example.com/b" }],
  docs: ["docs/attacks/sample.md"],
  fixtures: {
    malicious: [fixture("hit", "preinstall")],
    benign: [fixture("miss", "sample")],
  },
})

function roundTrip(doc: Record<string, unknown>) {
  const { rule, extras } = splitStaffRule(doc)
  const built = draftToRule(ruleToDraft(rule))
  assert.deepEqual(built.errors, {}, String(doc.id))
  return joinStaffRule(built.rule!, extras)
}

test("a staff rule survives the shared editor, advanced and responses included", () => {
  assert.deepEqual(roundTrip(staff), staff)
})

test("every catalog rule with staff extras survives the shared editor", () => {
  for (const rule of catalogRules) {
    const doc = staffRuleSchema.parse({
      ...rule,
      explanation: "x",
      references: [{ title: "t", url: "https://example.com" }],
    })
    assert.deepEqual(roundTrip(doc), doc, rule.id)
  }
})

test("split keeps rule fields and staff fields apart", () => {
  const { rule, extras } = splitStaffRule(staff)
  assert.equal("fixtures" in rule, false)
  assert.equal("severity" in extras, false)
  assert.deepEqual(extras.docs, ["docs/attacks/sample.md"])
})
