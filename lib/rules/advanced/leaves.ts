import picomatch from "picomatch"
import type { AttackPath, Fact } from "@/lib/code-intel/types"
import type { FileLines } from "@/lib/diff-lines"
import { confirmContentMatches, evaluateRule, type PushContext } from "@/lib/engine"
import { toRegex } from "@/lib/rules/operators"
import type { Leaf } from "@/schemas/rule-advanced"
import type { Rule } from "@/schemas/rule"

// `facts` are the live facts of the changed files; `history` is every fact the
// window may reach, removed ones included, newest first.
export type AdvancedInput = {
  push: PushContext
  added: FileLines
  removed: FileLines
  rules: string[]
  facts: Fact[]
  history: Fact[]
  pushed: string[]
  paths: AttackPath[]
  indicators: { campaign: string; kind: string }[]
}

export type Evidence = { files: string[]; lines: string[] }

const NO_EVIDENCE: Evidence = { files: [], lines: [] }

// Leaves that the rule engine already answers are compiled to a one-off rule,
// so globs, change types, line patterns and push details match the same way.
const probe = (fields: Partial<Rule>): Rule => ({ id: "condition-leaf", severity: "low", enabled: true, ...fields })

const factLine = (f: Fact) => `${f.path}${f.line === null ? "" : `:${f.line}`} ${f.kind} ${f.detail}`

function factsLeaf(leaf: Extract<Leaf, { facts: unknown }>["facts"], pool: Fact[]): Evidence | null {
  const wanted = new Set(leaf.kinds)
  const relevant = pool.filter((f) => wanted.has(f.kind) && (!leaf.same_symbol || f.symbol !== null))
  const key = (f: Fact) => (leaf.same_symbol ? `${f.path}\0${f.symbol}` : leaf.same_file ? f.path : "")
  for (const group of Map.groupBy(relevant, key).values()) {
    const kinds = new Set(group.map((f) => f.kind))
    if (kinds.size === wanted.size) {
      return { files: [...new Set(group.map((f) => f.path))], lines: group.map(factLine) }
    }
  }
  return null
}

function pathLeaf(leaf: Extract<Leaf, { path: unknown }>["path"], paths: AttackPath[]): Evidence | null {
  const entry = leaf.entry ? picomatch(leaf.entry, { dot: true }) : null
  const found = paths.find(
    (p) =>
      leaf.sink.includes(p.sink) &&
      (!entry || entry(p.entry.path)) &&
      (leaf.through ?? []).every((kind) => p.hops.some((h) => h.facts.includes(kind))),
  )
  if (!found) return null
  const hops = found.hops.map((h) => `${h.ref.path}:${h.ref.line} ${h.ref.name}`)
  return {
    files: [...new Set([found.entry.path, ...found.hops.map((h) => h.ref.path)])],
    lines: [`${[found.entry.path, ...hops].join(" -> ")} (${found.sink})`],
  }
}

export function matchLeaf(leaf: Leaf, input: AdvancedInput, pool: Fact[]): Evidence | null {
  if ("files" in leaf) {
    const match = evaluateRule(probe({ paths: leaf.files.paths, exclude_paths: leaf.files.exclude, change_type: leaf.files.change }), input.push)
    return match && { files: match.matchedFiles, lines: [] }
  }
  if ("lines" in leaf) {
    const { op, values, files } = leaf.lines
    const match = evaluateRule(probe({ added_lines: values.map((value) => toRegex({ op, value })), paths: files }), input.push)
    const confirmed = match && confirmContentMatches([match], input.added)[0]
    return confirmed ? { files: confirmed.matchedFiles, lines: confirmed.matchedLines } : null
  }
  if ("rule" in leaf) return input.rules.includes(leaf.rule) ? { files: [], lines: [`rule ${leaf.rule} fired`] } : null
  if ("facts" in leaf) return factsLeaf(leaf.facts, pool)
  if ("path" in leaf) return pathLeaf(leaf.path, input.paths)
  if ("indicator" in leaf) {
    const { campaign, kind } = leaf.indicator
    const hit = input.indicators.find((i) => (!campaign || i.campaign.toLowerCase() === campaign.toLowerCase()) && (!kind || i.kind === kind))
    return hit ? { files: [], lines: [`${hit.kind} indicator from ${hit.campaign}`] } : null
  }
  return evaluateRule(probe({ when: leaf.context }), input.push) ? NO_EVIDENCE : null
}
