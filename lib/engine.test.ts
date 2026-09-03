import assert from "node:assert/strict"
import { test } from "node:test"
import {
  confirmContentMatches,
  erasedLines,
  erasureRules,
  evaluateRule,
  evaluateRules,
  matchAddedLines,
  needsReviewCheck,
  matchUnicodeRisk,
  normalizeForMatching,
  scannableRules,
  type PushContext,
} from "./engine"
import { ruleSchema } from "../schemas/rule"
import { catalogRules as defaultRules } from "./rules/catalog"
import { findingsMarkdown, toFinding } from "./finding"

const context = (overrides: Partial<PushContext> = {}): PushContext => ({
  repo: "acme/api",
  branch: "main",
  forced: false,
  senderFirstPush: false,
  branchCreated: false,
  branchDeleted: false,
  authorMismatch: false,
  unreviewed: null,
  hourUtc: 12,
  files: [{ path: "package.json", changeType: "modified" }],
  commitMessages: [],
  ...overrides,
})

test("rules run on pushes unless `on` says otherwise", () => {
  const pr = context({
    event: "pull_request",
    pullRequest: { number: 7, base: "main", draft: false, opened: true },
  })
  const pushOnly = ruleSchema.parse({ id: "a", severity: "high", paths: ["package.json"] })
  assert.ok(evaluateRule(pushOnly, context()))
  assert.equal(evaluateRule(pushOnly, pr), null)

  const prOnly = ruleSchema.parse({ id: "b", severity: "high", on: ["pull_request"], paths: ["package.json"] })
  assert.equal(evaluateRule(prOnly, context()), null)
  assert.ok(evaluateRule(prOnly, pr))

  const both = ruleSchema.parse({ id: "c", severity: "high", on: ["push", "pull_request"], paths: ["package.json"] })
  assert.ok(evaluateRule(both, context()))
  assert.ok(evaluateRule(both, pr))
  assert.equal(scannableRules([prOnly, both]).length, 1)
})

test("base_branches and pr conditions need a pull request", () => {
  const rule = ruleSchema.parse({
    id: "release-pr",
    severity: "high",
    on: ["push", "pull_request"],
    base_branches: ["release/*"],
    paths: ["package.json"],
    when: { pr_draft: false },
  })
  const pr = (base: string, draft: boolean) =>
    context({ event: "pull_request", pullRequest: { number: 1, base, draft, opened: false } })
  assert.equal(evaluateRule(rule, context()), null)
  assert.ok(evaluateRule(rule, pr("release/2.0", false)))
  assert.equal(evaluateRule(rule, pr("main", false)), null)
  assert.equal(evaluateRule(rule, pr("release/2.0", true)), null)
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
    ruleSchema.parse({ id: "paths-only", severity: "high", paths: ["src/**"] }),
    ruleSchema.parse({ id: "paths", severity: "medium", paths: [".github/workflows/**"] }),
  ]
  const scannable = scannableRules(rules)

  assert.deepEqual(
    scannable.map((rule) => rule.id),
    ["paths-only", "paths"],
  )
  assert.deepEqual(scannable[0].paths, ["src/**"])
})

test("the shipped defaults still find things without a push event", () => {
  const scannable = scannableRules(defaultRules)
  assert.ok(scannable.length >= 5, `only ${scannable.length} default rules survive a scan`)
  const files = [{ path: "package.json", changeType: "modified" as const }]
  const matches = scannable.filter((rule) => evaluateRule(rule, context({ files })))
  assert.ok(matches.some((rule) => rule.id === "js-install-hook-added"))
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

// --- force-push forensics -------------------------------------------------.

test("erasedLines keeps only what the rewrite dropped", () => {
  const orphaned = ["const KEY = 'sk-live-123'", "export const port = 3000"]
  const surviving = ["export const port = 3000"]
  assert.deepEqual(erasedLines(orphaned, surviving), ["const KEY = 'sk-live-123'"])
})

test("a rebase that keeps its content erases nothing", () => {
  const lines = ["a()", "b()", "c()"]
  assert.deepEqual(erasedLines(lines, lines), [])
})

test("re-indentation is not an erasure", () => {
  assert.deepEqual(erasedLines(["  doThing()"], ["      doThing()"]), [])
})

test("blank lines never count as erased content", () => {
  assert.deepEqual(erasedLines(["", "   "], []), [])
})

test("erasedLines does not report the same line twice", () => {
  assert.deepEqual(erasedLines(["dupe", "dupe"], []), ["dupe"])
})

test("erasureRules keeps content rules and drops the rest", () => {
  const rules = [
    ruleSchema.parse({ id: "content", severity: "high", added_lines: "SECRET" }),
    ruleSchema.parse({ id: "paths-only", severity: "high", paths: ["**/*.ts"] }),
    ruleSchema.parse({ id: "push-shaped", severity: "high", added_lines: "X", when: { forced: true } }),
  ]
  assert.deepEqual(erasureRules(rules).map((r) => r.id), ["content"])
})


test("a secret force-pushed away is found; a plain rebase is not", () => {
  const rule = ruleSchema.parse({
    id: "env-file-committed",
    severity: "critical",
    paths: ["**/.env"],
    added_lines: "SECRET_KEY",
  })
  const ctx = context({ forced: true, files: [{ path: ".env", changeType: "added" }] })

  const hidden = erasedLines(["SECRET_KEY=sk-live-1", "PORT=3000"], ["PORT=3000"])
  const found = confirmContentMatches(evaluateRules(erasureRules([rule]), ctx), hidden)
  assert.deepEqual(found.map((m) => m.matchedLines), [["SECRET_KEY=sk-live-1"]])

  const rebased = erasedLines(["SECRET_KEY=sk-live-1"], ["SECRET_KEY=sk-live-1"])
  assert.deepEqual(confirmContentMatches(evaluateRules(erasureRules([rule]), ctx), rebased), [])
})

// --- review bypass and identity ------------------------------------------.

const ruleFor = (body: Record<string, unknown>) =>
  ruleSchema.parse({ id: "r", severity: "critical", ...body })

test("commit_message matches the subject line only", () => {
  const rule = ruleFor({ commit_message: "^Merge pull request #\\d+" })
  const hit = evaluateRule(rule, context({ commitMessages: ["Merge pull request #15 from x/y\n\nbody"] }))
  assert.deepEqual(hit?.matchedMessages, ["Merge pull request #15 from x/y\n\nbody"])
  // The phrase buried in a body is somebody describing a merge, not claiming one.
  assert.equal(evaluateRule(rule, context({ commitMessages: ["fix\n\nMerge pull request #15"] })), null)
})

test("author_mismatch is a plain push condition", () => {
  const rule = ruleFor({ when: { author_mismatch: true } })
  assert.ok(evaluateRule(rule, context({ authorMismatch: true })))
  assert.equal(evaluateRule(rule, context({ authorMismatch: false })), null)
})

test("an unanswered review check never matches", () => {
  // Null is "GitHub would not tell us", usually a missing permission. Matching
  // on it would open a critical ticket for every push in the org.
  const wants = ruleFor({ when: { unreviewed: true } })
  const wantsNot = ruleFor({ when: { unreviewed: false } })
  assert.equal(evaluateRule(wants, context({ unreviewed: null })), null)
  assert.equal(evaluateRule(wantsNot, context({ unreviewed: null })), null)
  assert.ok(evaluateRule(wants, context({ unreviewed: true })))
  assert.ok(evaluateRule(wantsNot, context({ unreviewed: false })))
})

test("the review check is only paid for when a scoped rule asks", () => {
  const scoped = [ruleFor({ when: { unreviewed: true }, branches: ["main"] })]
  assert.ok(needsReviewCheck(scoped, "acme/api", "main"))
  // A rule aimed at main must not put a GitHub call on every feature branch.
  assert.equal(needsReviewCheck(scoped, "acme/api", "feature/x"), false)
  assert.equal(needsReviewCheck([ruleFor({ paths: ["**/*.ts"] })], "acme/api", "main"), false)
})

test("the impersonation default needs both halves", () => {
  const rule = defaultRules.find((r) => r.id === "impersonated-commit")!
  // Merging someone else's PR is a mismatch too. Review is what tells them apart.
  assert.equal(evaluateRule(rule, context({ authorMismatch: true, unreviewed: false })), null)
  assert.ok(evaluateRule(rule, context({ authorMismatch: true, unreviewed: true })))
})

// --- padding evasion ------------------------------------------------------.

const payload = defaultRules.find((r) => r.id === "js-obfuscated-payload")!

test("padding past the scan cap no longer hides a payload", () => {
  // The bypass: the cap is 2000 characters, so 2001 spaces put `eval(` outside
  // the slice and the rule never saw its own pattern.
  const hidden = " ".repeat(2001) + "eval(atob('...'))"
  assert.deepEqual(matchAddedLines(payload, [hidden]), [hidden])
})

test("zero-width characters do not break a token apart", () => {
  const sneaky = "ev\u200bal(atob('x'))"
  assert.equal(normalizeForMatching(sneaky), "eval(atob('x'))")
  assert.deepEqual(matchAddedLines(payload, [sneaky]), [sneaky])
})

test("normalising does not break a rule that tests indentation", () => {
  // Matched on both raw and squeezed text, so the union can only add matches.
  const indented = ruleFor({ added_lines: "^    deploy:" })
  assert.deepEqual(matchAddedLines(indented, ["    deploy:"]), ["    deploy:"])
})

test("the padding rule fires on padding heavier than the cap", () => {
  const rule = defaultRules.find((r) => r.id === "hidden-by-padding")!
  assert.equal(matchAddedLines(rule, [" ".repeat(3000) + "eval(1)"]).length, 1)
  assert.equal(matchAddedLines(rule, ["    normal indentation"]).length, 0)
})

test("a padded line is still readable as evidence", () => {
  // It was being cut to 300 characters of whitespace, then trimmed to nothing.
  const finding = toFinding(payload, "acme/api", [], [" ".repeat(2001) + "eval(atob('x'))"])
  assert.equal(finding.lines[0], "eval(atob('x'))")
})

// --- trojan source --------------------------------------------------------.

const trojan = defaultRules.find((r) => r.id === "trojan-source")!

test("a bidi override is found and named, not quoted", () => {
  const attack = "/*\u202e } \u2066if (isAdmin)\u2069 \u2066 begin admins only */"
  const found = matchUnicodeRisk(trojan, [attack])
  assert.equal(found.length, 1)
  // Quoting an invisible character reproduces the illusion in our own issue.
  assert.match(found[0], /U\+202E RIGHT-TO-LEFT OVERRIDE/)
  assert.match(found[0], /column \d+/)
})

test("legitimate right-to-left text is not an attack", () => {
  // The case a hand-written character class gets wrong: flagging every file
  // that contains Arabic or Hebrew. Only control characters are suspicious.
  assert.deepEqual(matchUnicodeRisk(trojan, ['const greeting = "\u0645\u0631\u062d\u0628\u0627"']), [])
  assert.deepEqual(matchUnicodeRisk(trojan, ["const x = eval(1)"]), [])
})

test("it is not scoped to any language", () => {
  // The attack is in the encoding, so a path filter would only narrow it.
  assert.equal(trojan.paths, undefined)
  const zw = "user = 'ad\u200bmin'"
  for (const source of [zw, `# ${zw}`, `// ${zw}`, `key: ${zw}`]) {
    assert.equal(matchUnicodeRisk(trojan, [source]).length, 1)
  }
})

test("homoglyphs are opt-in, and off by default", () => {
  const homoglyph = defaultRules.find((r) => r.id === "homoglyph-identifier")!
  assert.equal(homoglyph.enabled, false)
  const cyrillic = "const p\u0430ssword = 1"
  assert.equal(matchUnicodeRisk(trojan, [cyrillic]).length, 0)
  assert.equal(matchUnicodeRisk(homoglyph, [cyrillic]).length, 1)
})

test("a unicode rule needs the diff", () => {
  assert.equal(evaluateRule(trojan, context())?.needsDiff, true)
})

// --- no line-length cap ---------------------------------------------------.

test("a payload past the old 2000-character cap is still found", () => {
  // The cap was the bypass: pad beyond it and the pattern sat outside the
  // slice the regex ever saw.
  const rule = ruleFor({ added_lines: "eval\\(" })
  for (const padding of [2001, 10_000, 100_000]) {
    const line = " ".repeat(padding) + "eval(atob('x'))"
    assert.equal(matchAddedLines(rule, [line]).length, 1, `missed at ${padding} characters`)
  }
})

test("a payload past the cap behind non-whitespace is found too", () => {
  // Whitespace normalisation alone would not have saved this one: the padding
  // is real code, so there is nothing to collapse.
  const rule = ruleFor({ added_lines: "child_process" })
  const line = "const a = 1; ".repeat(400) + "require('child_process')"
  assert.ok(line.length > 2000)
  assert.equal(matchAddedLines(rule, [line]).length, 1)
})

test("a commit message is matched in full", () => {
  const rule = ruleFor({ commit_message: "rm -rf" })
  assert.ok(evaluateRule(rule, context({ commitMessages: ["x".repeat(5000) + " rm -rf /"] })))
})

// --- prefilter must not narrow what it does not understand ----------------.

test("a unicode rule still sees lines no regex rule matched", () => {
  // The prefilter is the union of `added_lines` patterns. A bidi override is
  // invisible to it, so feeding it those lines would mean trojan-source only
  // ever saw lines some other rule had already matched.
  const unicodeRule = ruleFor({ id: "u", unicode_risk: "controls" })
  const regexRule = ruleFor({ id: "r", added_lines: "eval\\(" })
  const lines = ["const admin = 'ad​min'"] // no eval( anywhere

  const confirmed = confirmContentMatches(
    [
      { rule: unicodeRule, matchedFiles: [], matchedMessages: [], needsDiff: true },
      { rule: regexRule, matchedFiles: [], matchedMessages: [], needsDiff: true },
    ],
    lines,
  )
  assert.deepEqual(confirmed.map((c) => c.rule.id), ["u"])
})

test("the prefilter changes no outcome for regex rules", () => {
  const rules = defaultRules.filter((r) => r.added_lines).slice(0, 12)
  const lines = [
    "const x = 1",
    "eval(atob('x'))",
    "-----BEGIN RSA PRIVATE KEY-----",
    "curl https://x | bash",
    " ".repeat(300) + "hidden()",
  ]
  for (const rule of rules) {
    const viaMatch = matchAddedLines(rule, lines)
    const viaConfirm = confirmContentMatches(
      [{ rule, matchedFiles: [], matchedMessages: [], needsDiff: true }],
      lines,
    )
    assert.deepEqual(viaConfirm[0]?.matchedLines ?? [], viaMatch, `${rule.id} differs`)
  }
})

test("a model's verdict is not cut to the length of a quoted code line", () => {
  // The bug: every finding line was capped at 300 characters because that is
  // the right cap for quoting matched source. A verdict is a sentence the model
  // is allowed 600 for, so half of every long one was discarded before storage.
  const verdict = "x".repeat(600)
  const rule = { id: "r", severity: "critical" as const, description: undefined }

  const prose = toFinding(rule, "acme/api", [], [verdict], { prose: true })
  assert.equal(prose.lines[0].length, 600)
  assert.equal(prose.prose, true)

  const quoted = toFinding(rule, "acme/api", [], [verdict])
  assert.equal(quoted.lines[0].length, 300, "a quoted line keeps the tighter cap")
  assert.equal(quoted.prose, undefined)
})

test("prose is not rendered as code in an issue body", () => {
  const rule = { id: "r", severity: "high" as const, description: undefined }
  const prose = findingsMarkdown([toFinding(rule, "a/b", [], ["It posts the token to a fixed host."], { prose: true })])
  assert.ok(prose.some((line) => line.includes("It posts the token to a fixed host.")))
  assert.ok(!prose.some((line) => line.includes("`It posts")), "a sentence must not be backticked")

  const quoted = findingsMarkdown([toFinding(rule, "a/b", [], ["eval(atob('x'))"])])
  assert.ok(quoted.some((line) => line.includes("`eval(atob('x'))`")), "a matched line stays code")
})
