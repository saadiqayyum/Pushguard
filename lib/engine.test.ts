import assert from "node:assert/strict"
import { test } from "node:test"
import { confirmContentMatches, evaluateRule, matchAddedLines, type PushContext } from "./engine"
import { ruleSchema } from "../schemas/rule"

const context = (overrides: Partial<PushContext> = {}): PushContext => ({
  repo: "acme/api",
  branch: "main",
  forced: false,
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
