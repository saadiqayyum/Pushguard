import { DAY_MS } from "@/lib/code-intel/limits"
import type { Fact } from "@/lib/code-intel/types"
import { confirmContentMatches, evaluateRules } from "@/lib/engine"
import { MAX_FILES_PER_FINDING, MAX_LINES_PER_FINDING } from "@/lib/finding"
import type { Condition, Leaf, Within } from "@/schemas/rule-advanced"
import type { Rule } from "@/schemas/rule"
import { ruleOf, type StaffRule } from "@/schemas/staff-rule"
import { fixtureInput } from "./fixture-input"
import { matchLeaf, type AdvancedInput, type Evidence } from "./leaves"

export type { AdvancedInput, Evidence } from "./leaves"
export type RuleHit = { rule: Rule; evidence: Evidence }
export type FixtureResult = { fixture: string; expected: "hit" | "clean"; got: "hit" | "clean" }

const merge = (parts: Evidence[]): Evidence => ({
  files: [...new Set(parts.flatMap((p) => p.files))].slice(0, MAX_FILES_PER_FINDING),
  lines: parts.flatMap((p) => p.lines).slice(0, MAX_LINES_PER_FINDING),
})

function evaluate(condition: Condition, input: AdvancedInput, pool: Fact[]): Evidence | null {
  if ("all" in condition) {
    const parts: Evidence[] = []
    for (const child of condition.all) {
      const found = evaluate(child, input, pool)
      if (!found) return null
      parts.push(found)
    }
    return merge(parts)
  }
  if ("any" in condition) {
    const parts = condition.any.map((child) => evaluate(child, input, pool)).filter((e): e is Evidence => e !== null)
    return parts.length > 0 ? merge(parts) : null
  }
  if ("not" in condition) return evaluate(condition.not, input, pool) ? null : { files: [], lines: [] }
  return matchLeaf(condition, input, pool)
}

// The facts a `within` window reaches: the last N commits that recorded facts,
// and no older than D days, whichever is tighter.
export function windowFacts(history: Fact[], within: Within, now = Date.now()): Fact[] {
  const since = within.days === undefined ? -Infinity : now - within.days * DAY_MS
  const recent = history.filter((f) => f.at.getTime() >= since).sort((a, b) => b.at.getTime() - a.at.getTime())
  if (within.commits === undefined) return recent
  const commits = new Set([...new Set(recent.map((f) => f.commit))].slice(0, within.commits))
  return recent.filter((f) => commits.has(f.commit))
}

export const leavesOf = (c: Condition): Leaf[] =>
  "all" in c ? c.all.flatMap(leavesOf) : "any" in c ? c.any.flatMap(leavesOf) : "not" in c ? leavesOf(c.not) : [c]

// A rule over facts fires only when this push added one of the kinds it asks
// about, so a window that was already complete does not fire again.
function pushContributed(when: Condition, pool: Fact[], pushed: string[]): boolean {
  const kinds = new Set(leavesOf(when).flatMap((leaf) => ("facts" in leaf ? leaf.facts.kinds : [])))
  return kinds.size === 0 || pool.some((f) => kinds.has(f.kind) && pushed.includes(f.commit))
}

// The pattern conditions and scope go through the engine, then the advanced tree.
export function evaluateAdvanced(rule: Rule, input: AdvancedInput): RuleHit | null {
  const { advanced, ...pattern } = rule
  const confirmed = confirmContentMatches(evaluateRules([pattern], input.push), input.added)[0]
  if (!confirmed) return null
  const found: Evidence = { files: confirmed.matchedFiles, lines: [...confirmed.matchedMessages, ...confirmed.matchedLines] }
  if (!advanced) return { rule, evidence: merge([found]) }
  const pool = advanced.within ? windowFacts(input.history, advanced.within) : input.facts
  if (!pushContributed(advanced.when, pool, input.pushed)) return null
  const evidence = evaluate(advanced.when, input, pool)
  return evidence && { rule, evidence: merge([found, evidence]) }
}

// Every malicious fixture must hit and every benign one must stay clean.
export async function runFixtures(staff: StaffRule): Promise<{ passed: boolean; results: FixtureResult[] }> {
  const fixtures = staff.fixtures ?? { malicious: [], benign: [] }
  const cases = [
    ...fixtures.malicious.map((f) => ({ fixture: f, expected: "hit" as const })),
    ...fixtures.benign.map((f) => ({ fixture: f, expected: "clean" as const })),
  ]
  const rule = ruleOf(staff)
  const results: FixtureResult[] = []
  for (const { fixture, expected } of cases) {
    const hit = evaluateAdvanced(rule, await fixtureInput(fixture))
    results.push({ fixture: fixture.name, expected, got: hit ? "hit" : "clean" })
  }
  return { passed: results.length > 0 && results.every((r) => r.expected === r.got), results }
}
