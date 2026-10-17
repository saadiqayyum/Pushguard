import { grammarFor, languageOf } from "./languages"
import { MAX_SYMBOL_NAME, MAX_SYMBOLS_PER_FILE } from "./limits"
import type { SymbolKind, SymbolRef } from "./types"

export type SymbolDraft = Omit<SymbolRef, "repo">

const KINDS: Record<string, SymbolKind> = {
  function: "function",
  macro: "function",
  call: "function",
  method: "method",
  class: "class",
  interface: "class",
  type: "class",
  implementation: "class",
  module: "module",
  constant: "variable",
  variable: "variable",
  field: "variable",
}

// Definitions and references in one file, or null when no grammar covers it
// and the token index is all there is.
export async function extractSymbols(path: string, source: string): Promise<SymbolDraft[] | null> {
  const language = languageOf(path)
  if (!language) return null
  const { parser, query } = await grammarFor(language)
  const tree = parser.parse(source)
  if (!tree) return null
  const found = new Map<string, SymbolDraft>()
  try {
    for (const match of query.matches(tree.rootNode)) {
      const tag = match.captures.find((c) => c.name.startsWith("definition.") || c.name.startsWith("reference."))
      const name = match.captures.find((c) => c.name === "name")?.node
      if (!tag || !name || name.text.length > MAX_SYMBOL_NAME) continue
      const [role, sub] = tag.name.split(".")
      const draft: SymbolDraft = {
        path,
        name: name.text,
        kind: KINDS[sub] ?? "other",
        role: role as SymbolDraft["role"],
        line: name.startPosition.row + 1,
        endLine: role === "definition" ? tag.node.endPosition.row + 1 : null,
      }
      const key = [draft.name, draft.role, draft.line].join("\0")
      const seen = found.get(key)
      if (seen && seen.kind !== "variable") continue
      found.set(key, draft)
      if (found.size >= MAX_SYMBOLS_PER_FILE) break
    }
  } finally {
    tree.delete()
  }
  return [...found.values()]
}

// The innermost definition around a line, which is what a fact belongs to.
export function enclosingSymbol(symbols: Pick<SymbolDraft, "name" | "role" | "line" | "endLine">[], line: number): string | null {
  let best: { name: string; span: number } | null = null
  for (const s of symbols) {
    if (s.role !== "definition" || s.endLine === null || line < s.line || line > s.endLine) continue
    const span = s.endLine - s.line
    if (!best || span < best.span) best = { name: s.name, span }
  }
  return best?.name ?? null
}
