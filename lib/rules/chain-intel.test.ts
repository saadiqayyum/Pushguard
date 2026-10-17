import assert from "node:assert/strict"
import { test } from "node:test"
import { extractFacts, pathReferences } from "@/lib/code-intel/facts"
import { mergeFileFacts } from "@/lib/code-intel/merge"
import { defenseErosion, dormantActivations, erosionFindings, pathFindings } from "@/lib/code-intel/signals"
import { extractSymbols, type SymbolDraft } from "@/lib/code-intel/symbols"
import { trace, type GraphReader } from "@/lib/code-intel/trace"
import { ENTRY_KINDS, type Fact, type FactKind } from "@/lib/code-intel/types"
import { CHAINS } from "@/lib/rules/fixtures/chains"
import { byFile } from "@/lib/rules/fixtures/lines"

const REPO = "fixture/app"
const DAY = 86_400_000
const START = Date.parse("2026-01-01T00:00:00Z")

type Stored = Fact & { id: string; removed: boolean }

// The database's write semantics, in memory: symbols replaced per file, facts
// merged so a surviving fact keeps the commit that introduced it.
class Store {
  symbols = new Map<string, SymbolDraft[]>()
  facts: Stored[] = []
  private ids = 0

  async commit(commit: string, author: string, day: number, files: Record<string, string | null>, removed: string[] = []) {
    const at = new Date(START + day * DAY)
    for (const path of removed) {
      this.symbols.delete(path)
      for (const f of this.live(path)) f.removed = true
    }
    for (const [path, source] of Object.entries(files)) {
      const parsed = source === null ? null : await extractSymbols(path, source)
      this.symbols.set(path, [...(parsed ?? []), ...(source === null ? [] : pathReferences(path, source.split("\n")))])
      const plan = mergeFileFacts(this.live(path), await extractFacts({ path, source }, parsed))
      for (const f of this.facts) if (plan.removed.includes(f.id)) f.removed = true
      for (const m of plan.moved) this.facts.find((f) => f.id === m.id)!.line = m.line
      for (const f of plan.insert) this.facts.push({ ...f, repo: REPO, commit, author, at, id: String(this.ids++), removed: false })
    }
  }

  live(path?: string): Stored[] {
    return this.facts.filter((f) => !f.removed && (path === undefined || f.path === path))
  }

  reader(): GraphReader {
    const all = () => [...this.symbols.values()].flat().map((s) => ({ ...s, repo: REPO }))
    return {
      symbolsIn: async (path) => (this.symbols.get(path) ?? []).map((s) => ({ ...s, repo: REPO })),
      factsIn: async (path) => this.live(path),
      definitionsOf: async (name) => all().filter((s) => s.role === "definition" && s.name === name),
      usagesOf: async (name) => all().filter((s) => s.role === "reference" && s.name === name),
      entries: async () => this.live().filter((f) => f.symbol === null || ENTRY_KINDS.includes(f.kind)),
      recentFacts: async (kind) => this.live().filter((f) => f.kind === kind),
    }
  }
}

const chain = (id: string) => CHAINS.find((c) => c.id === id)!
const commitOf = (id: string, step: number) => `${id}-c${step + 1}`

// One fixture step as file contents: its added lines, or null for a binary.
function stepFiles(id: string, step: number): { files: Record<string, string | null>; removed: string[] } {
  const { context, addedLines } = chain(id).steps[step]
  const lines = byFile(addedLines ?? [], context!)
  const files: Record<string, string | null> = {}
  for (const f of context!.files) {
    if (f.changeType !== "removed") files[f.path] = /\.bin$/.test(f.path) ? null : (lines.get(f.path) ?? []).join("\n")
  }
  return { files, removed: context!.files.filter((f) => f.changeType === "removed").map((f) => f.path) }
}

async function replay(id: string, authors: string[], days: number[] = authors.map((_, i) => i)): Promise<Store> {
  const store = new Store()
  for (const [i, author] of authors.entries()) {
    const { files, removed } = stepFiles(id, i)
    await store.commit(commitOf(id, i), author, days[i], files, removed)
  }
  return store
}

const traceTouching = (store: Store, touching: string[]) =>
  trace(store.reader(), REPO, { maxDepth: 6, limit: 10, touching, now: new Date(START + 30 * DAY) })

const kindsAt = (store: Store, path: string) => new Set(store.live(path).map((f) => f.kind))

test("FX-01 chain: L5 path opaque fixture -> decoder -> shell across commits 1 and 3, escalated by the defence erosion in 2", async () => {
  const store = await replay("FX-01", ["alice", "alice", "bob"])
  const [found] = await traceTouching(store, ["build/aux.m4"])
  assert.ok(found, "a path is found")
  const hops = new Map(found.path.hops.map((h) => [h.ref.path, h]))
  assert.equal(hops.get("tests/files/corrupt-sample.bin")?.commit, commitOf("FX-01", 0))
  assert.ok(hops.get("build/aux.m4")?.facts.includes("decode"))
  assert.equal(found.path.sink, "process")
  const [finding] = pathFindings(REPO, [found.path], new Set([commitOf("FX-01", 2)]))
  assert.equal(finding.ruleId, "assembled-attack-path")
  assert.equal(finding.severity, "critical")

  const unweakened = new Store()
  for (const i of [0, 2]) await unweakened.commit(commitOf("FX-01", i), "x", i, stepFiles("FX-01", i).files)
  const [plain] = await traceTouching(unweakened, ["build/aux.m4"])
  assert.ok(found.path.score > plain.path.score, "defence erosion raises the score")
})

test("FX-02 chain: L5 def/use path env -> encode -> network across three commits and two authors", async () => {
  const store = await replay("FX-02", ["alice", "alice", "bob"])
  const [found] = await traceTouching(store, ["src/telemetry.ts"])
  const byName = new Map(found.path.hops.map((h) => [h.ref.name, h]))
  assert.deepEqual(byName.get("readSettings")?.facts, ["secret_read"])
  assert.deepEqual(byName.get("pack")?.facts, ["obfuscation"])
  assert.equal(found.path.sink, "network")
  assert.equal(new Set(found.path.hops.map((h) => h.commit)).size, 3)
  assert.equal(pathFindings(REPO, [found.path], new Set([commitOf("FX-02", 2)]))[0].severity, "critical")
})

test("FX-03 chain: L4 gate facts (hash compare, file-age arithmetic)", async () => {
  const store = await replay("FX-03", ["alice"])
  const gates = store.live("src/improvement.ts").filter((f) => f.kind === "activation_gate")
  assert.deepEqual(gates.map((f) => f.detail).sort(), ["hash-compare", "time-gate"])
  assert.ok(gates.every((f) => f.symbol === "run"))
})

test("FX-03 chain: L5 zero-caller symbol gains its first caller", async () => {
  const store = await replay("FX-03", ["alice"])
  const { files } = stepFiles("FX-03", 1)
  const source = `function refreshInternal() {\n${files["src/refresh.ts"]}\n}`
  await store.commit(commitOf("FX-03", 1), "alice", 14, { "src/refresh.ts": source })
  const after = store.symbols.get("src/refresh.ts")!
  const findings = await dormantActivations(store.reader(), REPO, "src/refresh.ts", [], after)
  assert.equal(findings.length, 1)
  assert.equal(findings[0].ruleId, "dormant-code-activated")
  assert.ok(findings[0].lines.some((l) => l.includes("activation_gate")))
  assert.deepEqual(await dormantActivations(store.reader(), REPO, "src/refresh.ts", after, after), [])
})

test("FX-06 chain: L5 hook -> target edge surviving the rename", async () => {
  const store = await replay("FX-06", ["alice", "alice"])
  const refs = store.symbols.get("package.json")!.filter((s) => s.kind === "module").map((s) => s.name)
  assert.deepEqual(refs, ["npm/preinstall.js"])
  const hook = store.live("package.json").find((f) => f.kind === "install_hook" && f.detail === "npm-lifecycle preinstall")
  assert.equal(hook?.commit, commitOf("FX-06", 0), "the hook keeps the commit that added it")
  const runs = store.live("package.json").find((f) => f.kind === "process")
  assert.deepEqual([runs?.detail, runs?.commit], ["runs-file npm/preinstall.js", commitOf("FX-06", 1)])
})

test("FX-11 chain: L4 credential source (password field) -> network fact", async () => {
  const [workflow, form] = chain("FX-11").steps[0].addedLines as string[]
  const store = new Store()
  await store.commit("FX-11-c1", "dependabot[bot]", 0, { ".github/workflows/ci-helper.yml": workflow, "src/login.js": form })
  assert.ok(kindsAt(store, "src/login.js").has("secret_read"))
  assert.ok(kindsAt(store, ".github/workflows/ci-helper.yml").has("network"))
})

test("FX-15 chain: L5 path invisible constant -> decoder -> exec across commits", async () => {
  const store = await replay("FX-15", ["alice", "alice", "alice", "alice", "alice", "bob"], [0, 1, 1, 1, 1, 7])
  const [found] = await traceTouching(store, ["src/decode.ts"])
  const byName = new Map(found.path.hops.map((h) => [h.ref.name, h]))
  assert.equal(found.path.sink, "eval")
  assert.ok(byName.get("v")?.facts.includes("opaque_blob"))
  assert.equal(byName.get("v")?.commit, commitOf("FX-15", 0), "the payload is credited to the version bump")
  assert.ok(byName.get("s")?.facts.includes("decode"))
  assert.equal(pathFindings(REPO, [found.path], new Set([commitOf("FX-15", 5)]))[0].ruleId, "assembled-attack-path")
})

test("FX-18 chain: L5 task -> referenced file edge, re-evaluated when the file arrives", async () => {
  const store = await replay("FX-18", ["alice", "alice"])
  assert.deepEqual(await traceTouching(store, [".vscode/tasks.json"]), [], "nothing to run yet")
  await store.commit(commitOf("FX-18", 2), "bob", 3, stepFiles("FX-18", 2).files)
  const [found] = await traceTouching(store, ["assets/dictionary.txt"])
  assert.deepEqual(found.path.entry, { path: ".vscode/tasks.json" })
  assert.deepEqual(found.path.hops.map((h) => h.ref.path), [".vscode/tasks.json", "assets/dictionary.txt"])
  assert.equal(pathFindings(REPO, [found.path], new Set([commitOf("FX-18", 2)]))[0].ruleId, "assembled-attack-path")
})

test("FX-19 chain: L5 cumulative diff on a sensitive symbol over a window", async () => {
  const store = await replay("FX-19", ["acct-a", "acct-b", "acct-c"])
  const weakened = store.facts.filter((f) => f.path === "auth/check.ts" && f.kind === "defense_weakened")
  assert.deepEqual(weakened.map((f) => [f.author, f.detail]), [["acct-b", "auth-early-allow"], ["acct-c", "loose-auth-compare"]])
  assert.ok(weakened[0].removed, "the replaced change stays in history")
})

test("FX-22 chain: L4 gate-near-sink fact", async () => {
  const store = await replay("FX-22", ["alice"])
  const facts = store.live("src/beacon.ts")
  const gate = facts.find((f) => f.kind === "activation_gate" && f.detail === "ci-gate GITHUB_ACTIONS")
  const sink = facts.find((f) => f.kind === "network")
  assert.ok(gate && sink && gate.symbol === sink.symbol && Math.abs(sink.line! - gate.line!) <= 1)
})

test("FX-23 chain: duplicate-safe-helper-name rule: needs a repository symbol index", async () => {
  const store = new Store()
  const real = 'import { execFileSync } from "child_process"\nexport function safeExec(argv: string[]) {\n  return execFileSync(argv[0], argv.slice(1))\n}'
  await store.commit("base", "maintainer", 0, { "lib/process/safe-exec.ts": real })
  await store.commit(commitOf("FX-23", 0), "mallory", 1, stepFiles("FX-23", 0).files)
  const defs = await store.reader().definitionsOf("safeExec")
  assert.deepEqual(defs.map((d) => d.path).sort(), ["lib/process/safe-exec.ts", "lib/safe-exec.ts"])
  assert.ok(store.live("lib/safe-exec.ts").some((f) => f.kind === "process" && f.symbol === "safeExec"))
})

test("FX-25 chain: defence-erosion-near-capability-gain alert by one author circle", async () => {
  const store = await replay("FX-25", ["alice", "alice", "alice"])
  const now = new Date(START + 3 * DAY)
  const groups = defenseErosion(store.live(), now)
  assert.equal(groups.length, 1)
  const kinds = new Set<FactKind>(groups[0].map((f) => f.kind))
  assert.ok(kinds.has("entry_point") && kinds.has("defense_weakened"))
  const findings = erosionFindings(REPO, groups, new Set([commitOf("FX-25", 2)]))
  assert.equal(findings[0].ruleId, "defense-erosion-near-capability")
  assert.deepEqual(defenseErosion(store.live(), new Date(START + 90 * DAY)), [])
})
