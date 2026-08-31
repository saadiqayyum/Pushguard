import assert from "node:assert/strict"
import { test } from "node:test"
import {
  contextPaths,
  filesForRule,
  fitToBudget,
  MAX_CHARS_PER_FILE,
  MAX_FILES_PER_RULE,
  MAX_TOTAL_CHARS,
} from "@/lib/ai-rule-scope"
import { aiRuleSchema } from "@/schemas/ai-rule"
import type { ChangedFile, PushContext } from "@/lib/engine"

const rule = (body: Record<string, unknown>) =>
  aiRuleSchema.parse({ id: "r", severity: "high", prompt: "Is this malicious?", ...body })

const changed = (paths: string[]): ChangedFile[] =>
  paths.map((path) => ({ path, changeType: "modified" as const }))

test("a rule reads only the files its paths match", () => {
  // The cost control. A rule aimed at Python costs nothing on a JavaScript
  // push, and nobody has to declare what the repository is written in.
  const py = rule({ paths: ["**/*.py"] })
  assert.deepEqual(filesForRule(py, "acme/api", "main", changed(["app.py", "index.ts"])), ["app.py"])
  assert.deepEqual(filesForRule(py, "acme/api", "main", changed(["index.ts"])), [])
})

test("repo and branch scoping keep a rule off pushes it does not cover", () => {
  const scoped = rule({ repos: ["acme/*"], branches: ["main"] })
  const files = changed(["a.ts"])
  assert.equal(filesForRule(scoped, "other/api", "main", files).length, 0)
  assert.equal(filesForRule(scoped, "acme/api", "feature/x", files).length, 0)
  assert.equal(filesForRule(scoped, "acme/api", "main", files).length, 1)
})

test("deleted files and non-source files are never read", () => {
  const any = rule({})
  const files: ChangedFile[] = [
    { path: "gone.ts", changeType: "removed" },
    { path: "package-lock.json", changeType: "modified" },
    { path: "logo.png", changeType: "added" },
    { path: "src/a.go", changeType: "added" },
  ]
  assert.deepEqual(filesForRule(any, "acme/api", "main", files), ["src/a.go"])
})

test("exclude_paths wins over paths", () => {
  const r = rule({ paths: ["**/*.ts"], exclude_paths: ["**/*.test.ts"] })
  const files = changed(["a.ts", "a.test.ts"])
  assert.deepEqual(filesForRule(r, "acme/api", "main", files), ["a.ts"])
})

test("one push cannot make one rule read the whole tree", () => {
  const many = changed(Array.from({ length: 50 }, (_, i) => `src/f${i}.ts`))
  assert.ok(filesForRule(rule({}), "acme/api", "main", many).length <= 10)
})

test("what one rule sends never exceeds the total budget", () => {
  // The bug this replaces: the budget was checked before the file was read, so
  // the last file went in whole however little was left. Ten maximum-size files
  // against a 120,000 budget used to send 159,999 characters.
  const huge = "x".repeat(MAX_CHARS_PER_FILE * 2)
  let budget = MAX_TOTAL_CHARS
  let sent = 0
  for (let i = 0; i < 10; i++) {
    const body = fitToBudget(huge, budget)
    if (body === "") break
    assert.ok(body.length <= MAX_CHARS_PER_FILE, "no single file may exceed the per-file cap")
    budget -= body.length
    sent += body.length
  }
  assert.equal(sent, MAX_TOTAL_CHARS)
})

test("a spent budget reads nothing rather than a negative slice", () => {
  assert.equal(fitToBudget("abc", 0), "")
  assert.equal(fitToBudget("abc", -50), "")
  assert.equal(fitToBudget("abc", 2), "ab")
})

test("the context file list is bounded by length, not only by count", () => {
  // Forty paths is not forty short strings: GitHub allows about 4,000
  // characters of path, so a count alone bounds this at six figures.
  const long = Array.from({ length: 40 }, (_, i) => `${"d/".repeat(500)}f${i}.ts`)
  const listed = contextPaths(long)
  assert.ok(listed.length < 40, "a count-only cap would have taken all forty")
  assert.ok(listed.join("").length <= 4_000)

  // Ordinary paths are untouched.
  const normal = Array.from({ length: 40 }, (_, i) => `src/f${i}.ts`)
  assert.deepEqual(contextPaths(normal), normal)
  assert.equal(contextPaths(Array.from({ length: 60 }, (_, i) => `f${i}.ts`)).length, 40)
})

test("repository scope survives a round trip and carries a tool budget", () => {
  const r = aiRuleSchema.parse({
    id: "backdoor-hunt",
    severity: "critical",
    prompt: "Is there a backdoor anywhere?",
    scope: "repository",
  })
  assert.equal(r.scope, "repository")
  assert.equal(r.budget, 40)
  assert.equal(
    aiRuleSchema.safeParse({ id: "a", severity: "low", prompt: "x".repeat(10), budget: 500 }).success,
    false,
    "an unbounded tool budget is an unbounded bill",
  )
})

test("an AI rule needs a prompt and nothing else", () => {
  // No added_lines, no when: those describe a diff and a push event, and a
  // question about what code does is answered by reading the code.
  assert.ok(aiRuleSchema.safeParse({ id: "r", severity: "high", prompt: "Is this a backdoor?" }).success)
  assert.equal(aiRuleSchema.safeParse({ id: "r", severity: "high" }).success, false)
  assert.equal(
    aiRuleSchema.safeParse({ id: "r", severity: "high", prompt: "x", added_lines: "y" }).success,
    false,
  )
})

test("a catalog row saves without its display-only fields", () => {
  // The bug: the browse dialog tags each row with `kind` (and AI examples with
  // `pack`) so it can group them. Both schemas are strict, so carrying either
  // into the save is a rejected rule.
  const { kind, pack, ...rule } = {
    ...aiRuleSchema.parse({
      id: "example-x",
      severity: "high",
      prompt: "Is this a backdoor?",
    }),
    kind: "ai" as const,
    pack: "ai-examples",
  }
  void kind
  void pack
  assert.ok(aiRuleSchema.safeParse(rule).success)
  assert.equal(
    aiRuleSchema.safeParse({ ...rule, kind: "ai" }).success,
    false,
    "kind must not reach the schema",
  )
})

const pushContext = (over: Partial<PushContext> = {}): PushContext => ({
  repo: "acme/api",
  branch: "main",
  forced: false,
  senderFirstPush: false,
  branchCreated: false,
  branchDeleted: false,
  authorMismatch: false,
  unreviewed: null,
  hourUtc: 12,
  files: [],
  commitMessages: [],
  ...over,
})

test("an AI rule can be gated on the push event", () => {
  const onForce = rule({ when: { forced: true } })
  const files = changed(["src/a.ts"])
  assert.equal(filesForRule(onForce, "acme/api", "main", files, pushContext()).length, 0)
  assert.equal(
    filesForRule(onForce, "acme/api", "main", files, pushContext({ forced: true })).length,
    1,
  )
})

test("a when-gated AI rule never runs on a scan", () => {
  // A scan has no push event. Matching on an unknown would fire the rule on
  // every scanned repository the first time somebody wrote the condition.
  const onForce = rule({ when: { forced: true } })
  assert.equal(filesForRule(onForce, "acme/api", "main", changed(["src/a.ts"])).length, 0)
})

test("what one rule sends fits a single-invocation review", () => {
  // The budget has to survive a model call inside one function invocation.
  // 120k characters is roughly 30k tokens, and two sequential calls over that
  // is what blew the 25s deadline on a flash model.
  assert.ok(MAX_TOTAL_CHARS <= 120_000)
  assert.ok(MAX_CHARS_PER_FILE * MAX_FILES_PER_RULE >= MAX_TOTAL_CHARS,
    "the per-file cap must not be the thing that bounds a rule; the total is")
})
