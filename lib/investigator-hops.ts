import { stripComments } from "@/lib/code-comments"
import { compactLine } from "@/lib/compact"
import { fence } from "@/lib/fence"
import { MAX_HOPS } from "@/lib/investigator-verdict"
import type { AttackPath } from "@/lib/code-intel"

// Lines of context either side of a hop, and the most one slice may show.
const SLICE_CONTEXT = 12
const MAX_SLICE_LINES = 80

export type Hop = { path: string; line: number; endLine: number; label: string }
export type Candidate = { ruleId: string; files: string[]; lines: string[] }

export function hopsFromPath(path: AttackPath): Hop[] {
  const hops: Hop[] = "name" in path.entry ? [] : [{ path: path.entry.path, line: 1, endLine: 1, label: "entry" }]
  const refs = "name" in path.entry ? [path.entry, ...path.hops.map((h) => h.ref)] : path.hops.map((h) => h.ref)
  refs.forEach((ref, i) => {
    if (hops.some((h) => h.path === ref.path && h.line === ref.line)) return
    const sink = i === refs.length - 1 ? ` (${path.sink} sink)` : ""
    hops.push({ path: ref.path, line: ref.line, endLine: Math.max(ref.line, ref.endLine ?? ref.line), label: `${ref.kind} ${ref.name}${sink}` })
  })
  return hops.slice(0, MAX_HOPS)
}

// A deterministic finding names files and quotes matched lines; each file is a
// hop, anchored at the first quoted line found in it.
export function hopsFromFindings(candidates: Candidate[], sources: Map<string, string>): Hop[] {
  const hops: Hop[] = []
  for (const candidate of candidates) {
    for (const path of candidate.files) {
      const source = sources.get(path)
      if (!source || hops.some((h) => h.path === path)) continue
      const lines = source.split("\n")
      const quoted = candidate.lines.map((l) => l.trim()).filter((l) => l.length >= 8)
      const at = lines.findIndex((line) => quoted.some((q) => line.replace(/\s+/g, " ").includes(q)))
      const line = at === -1 ? 1 : at + 1
      hops.push({ path, line, endLine: line, label: candidate.ruleId })
    }
  }
  return hops.slice(0, MAX_HOPS)
}

export function pathTouches(path: AttackPath, files: string[]): boolean {
  return [path.entry, ...path.hops.map((h) => h.ref)].some((ref) => files.includes(ref.path))
}

// The hops with numbered code around each, fenced. `stripped` removes comments
// before slicing, keeping line numbers, for the comment-blind reading.
export function renderHops(hops: Hop[], sources: Map<string, string>, stripped: boolean): string {
  return hops
    .map((hop, i) => {
      const source = sources.get(hop.path)
      if (source === undefined) return fence("hop", { n: i + 1, path: hop.path, line: hop.line }, "[source could not be read]")
      const lines = (stripped ? stripComments(source, hop.path) : source).split("\n")
      const from = Math.max(1, hop.line - SLICE_CONTEXT)
      const to = Math.min(lines.length, hop.endLine + SLICE_CONTEXT, from + MAX_SLICE_LINES - 1)
      const body = lines
        .slice(from - 1, to)
        .map((line, j) => `${from + j}| ${compactLine(line).text}`)
        .join("\n")
      return fence("hop", { n: i + 1, path: hop.path, line: hop.line, label: hop.label }, body)
    })
    .join("\n\n")
}
