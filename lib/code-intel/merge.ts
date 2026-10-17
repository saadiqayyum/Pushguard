import type { FactDraft } from "./types"

type Stored = Pick<FactDraft, "symbol" | "kind" | "detail" | "line"> & { id: string }

const keyOf = (f: Pick<FactDraft, "symbol" | "kind" | "detail">) => [f.symbol, f.kind, f.detail].join("\0")

// A fact that survives an edit keeps the commit that introduced it: that is
// what lets a later push be seen completing something an earlier one started.
export function mergeFileFacts(
  stored: Stored[],
  fresh: FactDraft[],
): { insert: FactDraft[]; moved: { id: string; line: number | null }[]; removed: string[] } {
  const byKey = new Map(stored.map((f) => [keyOf(f), f]))
  const insert: FactDraft[] = []
  const moved: { id: string; line: number | null }[] = []
  const kept = new Set<string>()
  for (const fact of fresh) {
    const old = byKey.get(keyOf(fact))
    if (!old) insert.push(fact)
    else {
      kept.add(old.id)
      if (old.line !== fact.line) moved.push({ id: old.id, line: fact.line })
    }
  }
  return { insert, moved, removed: stored.filter((f) => !kept.has(f.id)).map((f) => f.id) }
}
