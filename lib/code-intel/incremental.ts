import { parseHunks } from "@/lib/diff-lines"
import { extractFacts, pathReferences } from "./facts"
import { hunkWindows, shiftLine } from "./line-map"
import { MAX_FACTS_PER_FILE, MAX_SYMBOLS_PER_FILE } from "./limits"
import { enclosingSymbol, extractSymbols, type SymbolDraft } from "./symbols"
import type { FactDraft } from "./types"

export type FileState = { symbols: SymbolDraft[]; facts: FactDraft[] }

const byLine = (a: { line: number | null }, b: { line: number | null }) => (a.line ?? 0) - (b.line ?? 0)

function firstPerKey<T>(items: T[], key: (item: T) => string, cap: number): T[] {
  const seen = new Map<string, T>()
  for (const item of items) if (!seen.has(key(item)) && seen.size < cap) seen.set(key(item), item)
  return [...seen.values()]
}

const relocate = <T extends { line: number; endLine: number | null }>(s: T, offset: number): T => ({
  ...s,
  line: s.line + offset,
  endLine: s.endLine === null ? null : s.endLine + offset,
})

// Symbols and facts after `patch`, from what was stored before it. Unchanged lines keep their
// rows, shifted; added lines are parsed inside their hunk so the parser sees the code around them.
export async function patchFileState(path: string, stored: FileState, patch: string): Promise<FileState> {
  const hunks = parseHunks(patch)
  const windows = hunkWindows(hunks)

  const kept = stored.symbols.flatMap((s) => {
    const line = shiftLine(hunks, s.line)
    if (line === null) return []
    return [{ ...s, line, endLine: s.endLine === null ? null : shiftLine(hunks, s.endLine, "before") }]
  })
  const replaced = stored.symbols
    .filter((s) => s.role === "definition" && s.endLine !== null && shiftLine(hunks, s.line) === null)
    .map((s) => ({ name: s.name, end: shiftLine(hunks, s.endLine!, "before") ?? 0 }))

  const fresh: SymbolDraft[] = []
  for (const w of windows) {
    const offset = w.start - 1
    const parsed = (await extractSymbols(path, w.text)) ?? []
    const refs = pathReferences(path, w.text.split("\n"))
    for (const s of [...parsed, ...refs].map((s) => relocate(s, offset))) {
      if (!w.added.has(s.line)) continue
      const cut = s.role === "definition" && s.endLine !== null && s.endLine >= w.end
      const before = cut ? replaced.find((r) => r.name === s.name && r.end > s.endLine!) : undefined
      fresh.push(before ? { ...s, endLine: before.end } : s)
    }
  }
  const symbols = firstPerKey([...kept, ...fresh].sort(byLine), (s) => [s.name, s.role, s.line].join("\0"), MAX_SYMBOLS_PER_FILE)

  const keptFacts = stored.facts.flatMap((f) => {
    if (f.line === null) return [f]
    const line = shiftLine(hunks, f.line)
    return line === null ? [] : [{ ...f, line, symbol: enclosingSymbol(symbols, line) }]
  })
  const freshFacts: FactDraft[] = []
  for (const w of windows) {
    const offset = w.start - 1
    const local = symbols.map((s) => relocate(s, -offset))
    for (const f of await extractFacts({ path, source: w.text }, local)) {
      const line = f.line === null ? null : f.line + offset
      if (line === null || w.added.has(line)) freshFacts.push({ ...f, line })
    }
  }
  const facts = firstPerKey([...keptFacts, ...freshFacts].sort(byLine), (f) => [f.symbol, f.kind, f.detail].join("\0"), MAX_FACTS_PER_FILE)
  return { symbols, facts }
}
