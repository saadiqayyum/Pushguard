import { factCommits, liveFacts, symbolsInPath, symbolsNamed } from "@/lib/db"
import { MAX_DEFINITIONS_PER_NAME, MAX_INTEL_ROWS, MAX_TRACE_DEPTH, MAX_TRACE_NODES } from "./limits"
import { trace, type GraphReader, type TraceOptions } from "./trace"
import { ENTRY_KINDS, type AttackPath, type Fact, type FactKind, type SymbolRef } from "./types"

export type { AttackPath, Fact, FactKind, PathHop, SymbolKind, SymbolRef } from "./types"
export type HistoryEntry = { commit: string; author: string | null; at: Date; kinds: FactKind[] }

// Callers run these inside asSystem or withUser; row-level security scopes the rows.
const cap = (limit: number) => Math.max(1, Math.min(limit, MAX_INTEL_ROWS))
const withRepo = (repo: string) => (rows: Omit<SymbolRef, "repo">[]): SymbolRef[] => rows.map((r) => ({ ...r, repo }))

export async function findDefinitions(repo: string, name: string, limit: number): Promise<SymbolRef[]> {
  return symbolsNamed(repo, name, "definition", cap(limit)).then(withRepo(repo))
}

export async function findUsages(repo: string, name: string, limit: number): Promise<SymbolRef[]> {
  return symbolsNamed(repo, name, "reference", cap(limit)).then(withRepo(repo))
}

export async function symbolsInFile(repo: string, path: string, limit: number): Promise<SymbolRef[]> {
  return symbolsInPath(repo, path, cap(limit)).then(withRepo(repo))
}

export async function factsFor(
  repo: string,
  opts: { symbol?: string; path?: string; sinceDays?: number; limit: number },
): Promise<Fact[]> {
  return liveFacts(repo, { ...opts, limit: cap(opts.limit) })
}

export async function historyOf(
  repo: string,
  target: { path?: string; symbol?: string },
  limit: number,
): Promise<HistoryEntry[]> {
  return factCommits(repo, target, cap(limit))
}

export function repoReader(repo: string): GraphReader {
  return {
    symbolsIn: (path) => symbolsInFile(repo, path, MAX_INTEL_ROWS),
    factsIn: (path) => factsFor(repo, { path, limit: MAX_INTEL_ROWS }),
    definitionsOf: (name) => findDefinitions(repo, name, MAX_DEFINITIONS_PER_NAME * 4),
    usagesOf: (name) => findUsages(repo, name, MAX_TRACE_NODES),
    entries: async () => {
      const facts = await liveFacts(repo, { limit: MAX_INTEL_ROWS })
      const entries = facts.filter((f) => f.symbol === null || ENTRY_KINDS.includes(f.kind))
      return [...new Map(entries.map((f) => [`${f.path}\0${f.symbol ?? ""}`, { path: f.path, symbol: f.symbol }])).values()]
    },
    recentFacts: (kind, sinceDays) => liveFacts(repo, { kind, sinceDays, limit: MAX_INTEL_ROWS }),
  }
}

export async function tracePaths(repo: string, opts: { maxDepth: number; limit: number }): Promise<AttackPath[]> {
  const options: TraceOptions = { maxDepth: Math.min(opts.maxDepth, MAX_TRACE_DEPTH), limit: cap(opts.limit) }
  return (await trace(repoReader(repo), repo, options)).map((found) => found.path)
}
