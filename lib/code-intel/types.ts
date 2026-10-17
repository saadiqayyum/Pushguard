export type SymbolKind = "function" | "class" | "method" | "variable" | "module" | "other"

export type SymbolRef = {
  repo: string
  path: string
  name: string
  kind: SymbolKind
  role: "definition" | "reference"
  line: number
  endLine: number | null
}

export const FACT_KINDS = [
  "network",
  "process",
  "eval",
  "env_read",
  "secret_read",
  "file_write",
  "decode",
  "obfuscation",
  "opaque_blob",
  "install_hook",
  "build_hook",
  "ci_trigger",
  "entry_point",
  "activation_gate",
  "defense_weakened",
] as const

export type FactKind = (typeof FACT_KINDS)[number]

export type Fact = {
  repo: string
  path: string
  symbol: string | null
  kind: FactKind
  detail: string
  line: number | null
  commit: string
  author: string | null
  at: Date
}

export type FactDraft = Pick<Fact, "path" | "symbol" | "kind" | "detail" | "line">

export type PathHop = { ref: SymbolRef; facts: FactKind[]; commit: string; author: string | null }

export type AttackPath = {
  entry: SymbolRef | { path: string }
  hops: PathHop[]
  sink: FactKind
  score: number
}

export const SINK_KINDS: readonly FactKind[] = ["network", "process", "eval", "file_write"]

// Plain env reads are every API client's config; only credential-shaped reads count.
export const SOURCE_KINDS: readonly FactKind[] = ["decode", "obfuscation", "opaque_blob", "secret_read"]

export const ENTRY_KINDS: readonly FactKind[] = ["install_hook", "build_hook", "ci_trigger", "entry_point"]

export const CAPABILITY_KINDS: readonly FactKind[] = [...SINK_KINDS, ...ENTRY_KINDS, "activation_gate"]
