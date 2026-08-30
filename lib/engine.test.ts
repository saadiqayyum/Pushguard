import assert from "node:assert/strict"
import { test } from "node:test"
import {
  confirmContentMatches,
  evaluateRule,
  matchAddedLines,
  scannableRules,
  type PushContext,
} from "./engine"
import { ruleSchema } from "../schemas/rule"
import { defaultRules } from "./default-rules"

const context = (overrides: Partial<PushContext> = {}): PushContext => ({
  repo: "acme/api",
  branch: "main",
  forced: false,
  senderFirstPush: false,
  branchCreated: false,
  branchDeleted: false,
  hourUtc: 12,
  files: [{ path: "package.json", changeType: "modified" }],
  ...overrides,
})

test("force push rule fires only on forced pushes", () => {
  const rule = ruleSchema.parse({ id: "force-push", severity: "critical", when: { forced: true } })
  assert.equal(evaluateRule(rule, context()), null)
  assert.ok(evaluateRule(rule, context({ forced: true })))
})

test("path rule matches globs and respects excludes and change types", () => {
  const rule = ruleSchema.parse({
    id: "env-file",
    severity: "critical",
    paths: ["**/.env", "**/.env.*"],
    exclude_paths: ["**/.env.example"],
    change_type: ["added", "modified"],
  })
  assert.ok(evaluateRule(rule, context({ files: [{ path: "apps/web/.env", changeType: "added" }] })))
  assert.equal(evaluateRule(rule, context({ files: [{ path: ".env.example", changeType: "added" }] })), null)
  assert.equal(evaluateRule(rule, context({ files: [{ path: ".env", changeType: "removed" }] })), null)
})

test("repo and branch scoping", () => {
  const rule = ruleSchema.parse({
    id: "scoped",
    severity: "high",
    repos: ["acme/payments-*"],
    branches: ["release/*"],
    paths: ["src/**"],
  })
  const files = [{ path: "src/index.ts", changeType: "modified" as const }]
  assert.equal(evaluateRule(rule, context({ files })), null)
  assert.ok(evaluateRule(rule, context({ repo: "acme/payments-api", branch: "release/1.2", files })))
})

test("added_lines regex confirms or dismisses content matches", () => {
  const rule = ruleSchema.parse({
    id: "postinstall",
    severity: "critical",
    paths: ["**/package.json"],
    added_lines: '"postinstall"\\s*:',
  })
  assert.deepEqual(matchAddedLines(rule, ['  "postinstall": "node evil.js",']), ['  "postinstall": "node evil.js",'])

  const match = evaluateRule(rule, context())
  assert.ok(match?.needsDiff)
  assert.equal(confirmContentMatches([match!], ['  "test": "vitest"']).length, 0)
  assert.equal(confirmContentMatches([match!], ['  "postinstall": "x"']).length, 1)
  assert.equal(confirmContentMatches([match!], null).length, 1)
})

test("hour_utc not_between fires outside the window", () => {
  const rule = ruleSchema.parse({
    id: "off-hours",
    severity: "low",
    when: { hour_utc: { not_between: [4, 18] } },
  })
  assert.equal(evaluateRule(rule, context({ hourUtc: 12 })), null)
  assert.ok(evaluateRule(rule, context({ hourUtc: 2 })))
})

test("scanning drops rules a snapshot of code cannot answer", () => {
  const rules = [
    ruleSchema.parse({ id: "forced", severity: "critical", when: { forced: true } }),
    ruleSchema.parse({ id: "ai-only", severity: "high", ai: "Does this diff exfiltrate secrets?" }),
    ruleSchema.parse({ id: "paths-and-ai", severity: "high", paths: ["src/**"], ai: "Is this a backdoor?" }),
    ruleSchema.parse({ id: "paths", severity: "medium", paths: [".github/workflows/**"] }),
  ]
  const scannable = scannableRules(rules)

  assert.deepEqual(
    scannable.map((rule) => rule.id),
    ["paths-and-ai", "paths"],
  )
  // The AI question is dropped, but the file test it was paired with survives.
  assert.equal(scannable[0].ai, undefined)
  assert.deepEqual(scannable[0].paths, ["src/**"])
})

test("the shipped defaults still find things without a push event", () => {
  const scannable = scannableRules(defaultRules)
  assert.ok(scannable.length >= 5, `only ${scannable.length} default rules survive a scan`)
  const files = [{ path: "package.json", changeType: "modified" as const }]
  const matches = scannable.filter((rule) => evaluateRule(rule, context({ files })))
  assert.ok(matches.some((rule) => rule.id === "install-hook-added"))
})

test("all_of needs every group hit by the same push", () => {
  const rule = ruleSchema.parse({
    id: "reviewers-and-ci",
    severity: "critical",
    all_of: [["CODEOWNERS", ".github/CODEOWNERS"], [".github/workflows/**"]],
  })
  const file = (path: string) => ({ path, changeType: "modified" as const })

  // Either area alone is routine; that is the whole point of the rule.
  assert.equal(evaluateRule(rule, context({ files: [file("CODEOWNERS")] })), null)
  assert.equal(evaluateRule(rule, context({ files: [file(".github/workflows/ci.yml")] })), null)

  const both = evaluateRule(rule, context({ files: [file("CODEOWNERS"), file(".github/workflows/ci.yml")] }))
  assert.ok(both)
  assert.deepEqual(both.matchedFiles.sort(), ["CODEOWNERS", ".github/workflows/ci.yml"].sort())
})

test("all_of respects exclude_paths and change_type like paths does", () => {
  const rule = ruleSchema.parse({
    id: "removed-only",
    severity: "high",
    all_of: [["CODEOWNERS"], [".github/workflows/**"]],
    change_type: ["removed"],
  })
  const both = [
    { path: "CODEOWNERS", changeType: "removed" as const },
    { path: ".github/workflows/ci.yml", changeType: "modified" as const },
  ]
  // The workflow was edited, not removed, so its group is empty.
  assert.equal(evaluateRule(rule, context({ files: both })), null)
})

test("a first push is a push condition, so scanning cannot answer it", () => {
  const rule = ruleSchema.parse({
    id: "first-push",
    severity: "medium",
    when: { sender_first_push: true },
  })
  assert.equal(evaluateRule(rule, context()), null)
  assert.ok(evaluateRule(rule, context({ senderFirstPush: true })))
  assert.equal(scannableRules([rule]).length, 0)
})

test("an all_of rule survives a scan, since files are all it needs", () => {
  const rule = ruleSchema.parse({
    id: "reviewers-and-ci",
    severity: "critical",
    all_of: [["CODEOWNERS"], [".github/workflows/**"]],
  })
  assert.equal(scannableRules([rule]).length, 1)
})

test("an org glob binds a rule to one organization", () => {
  const rule = ruleSchema.parse({
    id: "org-bound",
    severity: "high",
    repos: ["lasgoo/*"],
    when: { forced: true },
  })
  const forcedIn = (repo: string) => evaluateRule(rule, context({ repo, forced: true }))

  assert.ok(forcedIn("lasgoo/api"))
  assert.ok(forcedIn("lasgoo/web"))
  assert.equal(forcedIn("saadiqayyum/api"), null)
  // A repo whose owner merely starts with the org name must not match.
  assert.equal(forcedIn("lasgoo-other/api"), null)
  // The glob must not reach across the owner/name separator.
  assert.equal(forcedIn("other/lasgoo"), null)
})
