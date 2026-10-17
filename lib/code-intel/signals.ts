import type { ScanFinding } from "@/lib/db"
import { MAX_LINES_PER_FINDING, toFinding } from "@/lib/finding"
import { DAY_MS, DEFENSE_WINDOW_DAYS } from "./limits"
import type { SymbolDraft } from "./symbols"
import type { GraphReader } from "./trace"
import { CAPABILITY_KINDS, SOURCE_KINDS, type AttackPath, type Fact } from "./types"

const short = (commit: string) => commit.slice(0, 7)

const ASSEMBLED = {
  id: "assembled-attack-path",
  severity: "critical" as const,
  description: "Commits by different hands joined an entry point, a hidden or credential source and a sink into one path",
}
const SINGLE = {
  id: "attack-path",
  severity: "high" as const,
  description: "An entry point reaches a sink fed by a hidden or credential source",
}
const ACTIVATED = {
  id: "dormant-code-activated",
  severity: "high" as const,
  description: "Code that nothing called, carrying gated or dangerous capabilities, gained its first caller",
}
const EROSION = {
  id: "defense-erosion-near-capability",
  severity: "high" as const,
  description: "The same author weakened a security check and added an execution capability within a short window",
}

// A path this push completed. Every hop is cited, because whoever lands the
// last, innocent-looking edge is not necessarily the attacker.
export function pathFindings(repo: string, paths: AttackPath[], pushed: Set<string>): ScanFinding[] {
  return paths
    .filter((p) => p.hops.some((h) => pushed.has(h.commit)))
    .map((p) => {
      const commits = new Set(p.hops.map((h) => h.commit))
      const lines = p.hops.map(
        (h) => `${short(h.commit)} ${h.author ?? "unknown"} ${h.ref.path}:${h.ref.line} ${h.ref.name} [${h.facts.join(",")}]`,
      )
      const shown =
        lines.length > MAX_LINES_PER_FINDING
          ? [...lines.slice(0, MAX_LINES_PER_FINDING - 1), `and ${lines.length - MAX_LINES_PER_FINDING + 1} more hops ending in ${p.sink}`]
          : lines
      return toFinding(commits.size >= 2 ? ASSEMBLED : SINGLE, repo, p.hops.map((h) => h.ref.path), shown)
    })
}

// Names this push started calling that nothing called before, whose
// definitions carry a gate, a sink or a hidden source.
export async function dormantActivations(
  reader: GraphReader,
  repo: string,
  path: string,
  before: SymbolDraft[],
  after: SymbolDraft[],
): Promise<ScanFinding[]> {
  const old = new Set(before.filter((s) => s.role === "reference").map((s) => s.name))
  const added = [...new Set(after.filter((s) => s.role === "reference" && s.kind !== "module" && !old.has(s.name)).map((s) => s.name))]
  const findings: ScanFinding[] = []
  const flagged = new Set<string>()
  for (const name of added) {
    const defs = (await reader.definitionsOf(name)).filter((d) => d.path !== path && !flagged.has(d.path))
    if (defs.length === 0) continue
    const callers = (await reader.usagesOf(name)).filter((u) => u.path !== path && !defs.some((d) => d.path === u.path))
    if (callers.length > 0) continue
    for (const def of defs) {
      const facts = (await reader.factsIn(def.path)).filter(
        (f) => (f.symbol === def.name || (f.line !== null && f.line >= def.line && f.line <= (def.endLine ?? def.line))) &&
          [...CAPABILITY_KINDS, ...SOURCE_KINDS].includes(f.kind),
      )
      if (facts.length === 0) continue
      flagged.add(def.path)
      findings.push(
        toFinding(ACTIVATED, repo, [path, def.path], [
          `${path} now calls ${def.name} (${def.path}:${def.line})`,
          ...facts.map((f) => `${short(f.commit)} ${f.author ?? "unknown"} ${f.kind} ${f.detail}`),
        ]),
      )
    }
  }
  return findings
}

// Facts by one author inside the window: a check weakened beside a capability gained.
export function defenseErosion(facts: Fact[], now: Date = new Date()): Fact[][] {
  const recent = facts.filter((f) => f.author && now.getTime() - f.at.getTime() <= DEFENSE_WINDOW_DAYS * DAY_MS)
  const byAuthor = Map.groupBy(recent, (f) => f.author!)
  return [...byAuthor.values()].filter(
    (group) => group.some((f) => f.kind === "defense_weakened") && group.some((f) => CAPABILITY_KINDS.includes(f.kind)),
  )
}

export function erosionFindings(repo: string, groups: Fact[][], pushed: Set<string>): ScanFinding[] {
  return groups
    .filter((group) => group.some((f) => pushed.has(f.commit)))
    .map((group) =>
      toFinding(EROSION, repo, group.map((f) => f.path), group.map((f) => `${short(f.commit)} ${f.author} ${f.path}:${f.line ?? "-"} ${f.kind} ${f.detail}`)),
    )
}
