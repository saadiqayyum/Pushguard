import { extractFacts, pathReferences } from "@/lib/code-intel/facts"
import { MAX_PATHS_PER_PUSH, MAX_TRACE_DEPTH } from "@/lib/code-intel/limits"
import { mergeFileFacts } from "@/lib/code-intel/merge"
import { extractSymbols, type SymbolDraft } from "@/lib/code-intel/symbols"
import { trace, type GraphReader } from "@/lib/code-intel/trace"
import { ENTRY_KINDS, type Fact } from "@/lib/code-intel/types"
import type { FileLines } from "@/lib/diff-lines"
import { confirmContentMatches, evaluateRules, type ChangedFile, type PushContext } from "@/lib/engine"
import { catalogRules } from "@/lib/rules/catalog"
import type { Fixture } from "@/schemas/staff-rule"
import type { AdvancedInput } from "./leaves"

const REPO = "fixture/repo"
const BRANCH = "main"
const HOUR_MS = 3_600_000

type Stored = Fact & { id: string; removed: boolean }

// The database's write semantics in memory: symbols replaced per file, facts merged
// so a surviving fact keeps its commit. Earlier commits are history; the last is the push.
class FixtureStore {
  content = new Map<string, string[]>()
  symbols = new Map<string, SymbolDraft[]>()
  facts: Stored[] = []

  live(path?: string): Stored[] {
    return this.facts.filter((f) => !f.removed && (path === undefined || f.path === path))
  }

  async apply(commit: string, at: Date, files: Fixture["commits"][number]["files"]): Promise<void> {
    for (const file of files) {
      if (file.change === "removed") {
        this.content.delete(file.path)
        this.symbols.delete(file.path)
        for (const f of this.live(file.path)) f.removed = true
        continue
      }
      const lines = [...(this.content.get(file.path) ?? [])]
      for (const gone of file.removed ?? []) {
        const at = lines.indexOf(gone)
        if (at !== -1) lines.splice(at, 1)
      }
      lines.push(...(file.added ?? []))
      this.content.set(file.path, lines)
      const source = lines.join("\n")
      const parsed = await extractSymbols(file.path, source)
      this.symbols.set(file.path, [...(parsed ?? []), ...pathReferences(file.path, lines)])
      const plan = mergeFileFacts(this.live(file.path), await extractFacts({ path: file.path, source }, parsed))
      for (const f of this.facts) if (plan.removed.includes(f.id)) f.removed = true
      for (const m of plan.moved) this.facts.find((f) => f.id === m.id)!.line = m.line
      for (const f of plan.insert) this.facts.push({ ...f, repo: REPO, commit, author: "fixture", at, id: String(this.facts.length), removed: false })
    }
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

const linesOf = (files: Fixture["commits"][number]["files"], side: "added" | "removed"): FileLines =>
  new Map(files.filter((f) => (f[side]?.length ?? 0) > 0).map((f) => [f.path, f[side]!]))

export async function fixtureInput(fixture: Fixture): Promise<AdvancedInput> {
  const store = new FixtureStore()
  const now = Date.now()
  const ids = fixture.commits.map((_, i) => `fixture-c${i + 1}`)
  for (const [i, commit] of fixture.commits.entries()) {
    await store.apply(ids[i], new Date(now - (fixture.commits.length - i) * HOUR_MS), commit.files)
  }
  const push = fixture.commits.at(-1)!
  const files: ChangedFile[] = push.files.map((f) => ({ path: f.path, changeType: f.change }))
  const added = linesOf(push.files, "added")
  const touched = files.filter((f) => f.changeType !== "removed").map((f) => f.path)
  const context = push.context
  const pushContext: PushContext = {
    event: "push",
    repo: REPO,
    branch: BRANCH,
    forced: context?.forced ?? false,
    unreviewed: context?.unreviewed ?? false,
    senderFirstPush: context?.sender_first_push ?? false,
    authorMismatch: context?.author_mismatch ?? false,
    branchCreated: context?.branch_created ?? false,
    branchDeleted: context?.branch_deleted ?? false,
    hourUtc: context?.hour_utc ?? 12,
    files,
    commitMessages: push.message ? [push.message] : [],
  }
  const matches = evaluateRules(catalogRules.filter((r) => r.enabled), pushContext)
  const paths = await trace(store.reader(), REPO, { maxDepth: MAX_TRACE_DEPTH, limit: MAX_PATHS_PER_PUSH, touching: touched })
  return {
    push: pushContext,
    added,
    removed: linesOf(push.files, "removed"),
    rules: [...new Set(confirmContentMatches(matches, added).map((m) => m.rule.id))],
    facts: store.live().filter((f) => touched.includes(f.path)),
    history: [...store.facts].reverse(),
    pushed: [ids.at(-1)!],
    paths: paths.map((p) => p.path),
    indicators: context?.indicators ?? [],
  }
}
