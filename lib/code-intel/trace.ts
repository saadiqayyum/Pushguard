import {
  DAY_MS,
  DEFENSE_WINDOW_DAYS,
  MAX_DEFINITIONS_PER_NAME,
  MAX_SINKS_PER_ENTRY,
  MAX_SOURCES_PER_PATH,
  MAX_TRACE_ENTRIES,
  MAX_TRACE_NODES,
  RECENT_PATH_DAYS,
} from "./limits"
import { enclosingSymbol } from "./symbols"
import { ENTRY_KINDS, SINK_KINDS, SOURCE_KINDS, type AttackPath, type Fact, type FactKind, type PathHop, type SymbolRef } from "./types"

// What the tracer reads. The job passes a database-backed reader scoped to one
// repository; tests pass an in-memory one.
export type GraphReader = {
  symbolsIn(path: string): Promise<SymbolRef[]>
  factsIn(path: string): Promise<Fact[]>
  definitionsOf(name: string): Promise<SymbolRef[]>
  usagesOf(name: string): Promise<SymbolRef[]>
  entries(): Promise<{ path: string; symbol: string | null }[]>
  recentFacts(kind: FactKind, sinceDays: number): Promise<Fact[]>
}

export type TraceOptions = { maxDepth: number; limit: number; touching?: string[]; newAuthors?: Set<string>; now?: Date }

type Node = { path: string; symbol: string | null }
type Reached = Node & { depth: number; parent: string | null; facts: Fact[] }

const keyOf = (n: Node) => `${n.path}\0${n.symbol ?? ""}`

function memo<T>(fn: (arg: string) => Promise<T>): (arg: string) => Promise<T> {
  const cache = new Map<string, Promise<T>>()
  return (arg) => {
    if (!cache.has(arg)) cache.set(arg, fn(arg))
    return cache.get(arg)!
  }
}

function cached(reader: GraphReader): GraphReader {
  return {
    ...reader,
    symbolsIn: memo(reader.symbolsIn),
    factsIn: memo(reader.factsIn),
    definitionsOf: memo(reader.definitionsOf),
    usagesOf: memo(reader.usagesOf),
  }
}

const within = (line: number | null, defs: SymbolRef[]) =>
  line !== null && defs.some((d) => line >= d.line && line <= (d.endLine ?? d.line))

async function nodeFacts(reader: GraphReader, node: Node): Promise<Fact[]> {
  const facts = await reader.factsIn(node.path)
  if (node.symbol === null) return facts.filter((f) => f.symbol === null)
  const defs = (await reader.symbolsIn(node.path)).filter((s) => s.role === "definition" && s.name === node.symbol)
  return facts.filter((f) => f.symbol === node.symbol || within(f.line, defs))
}

async function isSurface(reader: GraphReader, path: string): Promise<boolean> {
  return (await reader.factsIn(path)).some((f) => f.symbol === null && ENTRY_KINDS.includes(f.kind))
}

// A file node covers its module-level code, or the whole file when the file
// itself is an execution surface (a hook, a workflow, a route).
async function scopeRefs(reader: GraphReader, node: Node): Promise<SymbolRef[]> {
  const symbols = await reader.symbolsIn(node.path)
  const refs = symbols.filter((s) => s.role === "reference")
  if (node.symbol === null) {
    if (await isSurface(reader, node.path)) return refs
    const defs = symbols.filter((s) => s.role === "definition")
    return refs.filter((r) => enclosingSymbol(defs, r.line) === null)
  }
  const defs = symbols.filter((s) => s.role === "definition" && s.name === node.symbol)
  return refs.filter((r) => within(r.line, defs))
}

async function known(reader: GraphReader, path: string): Promise<boolean> {
  return (await reader.factsIn(path)).length > 0 || (await reader.symbolsIn(path)).length > 0
}

async function children(reader: GraphReader, node: Node): Promise<Node[]> {
  const out: Node[] = []
  for (const ref of await scopeRefs(reader, node)) {
    if (ref.kind === "module") {
      if (await known(reader, ref.name)) out.push({ path: ref.name, symbol: null })
      continue
    }
    const defs = (await reader.definitionsOf(ref.name))
      .filter((d) => !(d.path === node.path && d.name === node.symbol))
      .sort((a, b) => Number(b.path === node.path) - Number(a.path === node.path))
      .slice(0, MAX_DEFINITIONS_PER_NAME)
    out.push(...defs.map((d) => ({ path: d.path, symbol: d.name })))
  }
  return out
}

async function isEntry(reader: GraphReader, node: Node): Promise<boolean> {
  const facts = await reader.factsIn(node.path)
  return facts.some((f) => f.symbol === node.symbol && (ENTRY_KINDS.includes(f.kind) || node.symbol === null))
}

// Entries that can reach the changed files, found by walking references backwards.
async function entriesReaching(reader: GraphReader, paths: string[], maxDepth: number): Promise<Node[]> {
  const seen = new Map<string, Node>()
  let frontier: Node[] = []
  for (const path of paths) {
    frontier.push({ path, symbol: null })
    for (const s of await reader.symbolsIn(path)) if (s.role === "definition") frontier.push({ path, symbol: s.name })
  }
  for (let depth = 0; depth <= maxDepth && frontier.length > 0 && seen.size < MAX_TRACE_NODES; depth++) {
    const next: Node[] = []
    for (const node of frontier) {
      if (seen.has(keyOf(node)) || seen.size >= MAX_TRACE_NODES) continue
      seen.set(keyOf(node), node)
      if (node.symbol !== null) next.push({ path: node.path, symbol: null })
      const usages = (await reader.usagesOf(node.symbol ?? node.path)).filter((u) => (u.kind === "module") === (node.symbol === null))
      for (const use of usages) {
        const defs = (await reader.symbolsIn(use.path)).filter((s) => s.role === "definition")
        next.push({ path: use.path, symbol: enclosingSymbol(defs, use.line) })
      }
    }
    frontier = next
  }
  const entries: Node[] = []
  for (const node of seen.values()) if (await isEntry(reader, node)) entries.push(node)
  return entries.slice(0, MAX_TRACE_ENTRIES)
}

async function reach(reader: GraphReader, entry: Node, maxDepth: number): Promise<Map<string, Reached>> {
  const reached = new Map<string, Reached>([[keyOf(entry), { ...entry, depth: 0, parent: null, facts: await nodeFacts(reader, entry) }]])
  let frontier = [entry]
  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
    const next: Node[] = []
    for (const node of frontier) {
      for (const child of await children(reader, node)) {
        if (reached.has(keyOf(child)) || reached.size >= MAX_TRACE_NODES) continue
        reached.set(keyOf(child), { ...child, depth, parent: keyOf(node), facts: await nodeFacts(reader, child) })
        next.push(child)
      }
    }
    frontier = next
  }
  return reached
}

function chain(reached: Map<string, Reached>, key: string): Reached[] {
  const out: Reached[] = []
  for (let at: string | null = key; at; at = reached.get(at)?.parent ?? null) out.unshift(reached.get(at)!)
  return out
}

async function refOf(reader: GraphReader, repo: string, node: Node): Promise<SymbolRef> {
  const def = node.symbol === null ? undefined : (await reader.symbolsIn(node.path)).find((s) => s.role === "definition" && s.name === node.symbol)
  return def ?? { repo, path: node.path, name: node.symbol ?? node.path, kind: "module", role: "definition", line: 1, endLine: null }
}

function hopOf(ref: SymbolRef, facts: Fact[]): PathHop {
  const newest = facts.reduce((a, b) => (b.at > a.at ? b : a))
  return { ref, facts: [...new Set(facts.map((f) => f.kind))], commit: newest.commit, author: newest.author }
}

const has = (n: Reached, kinds: readonly FactKind[]) => n.facts.some((f) => kinds.includes(f.kind))

// ponytail: reachability from one entry to a source and a sink, not taint flow.
// Precision comes from requiring both plus an entry; add dataflow if this is noisy.
export async function trace(source: GraphReader, repo: string, options: TraceOptions): Promise<{ path: AttackPath; nodes: string[] }[]> {
  const reader = cached(source)
  const now = options.now ?? new Date()
  const entries = options.touching
    ? await entriesReaching(reader, options.touching, options.maxDepth)
    : (await reader.entries()).slice(0, MAX_TRACE_ENTRIES)
  const weakened = (await reader.recentFacts("defense_weakened", DEFENSE_WINDOW_DAYS)).length > 0
  const touching = options.touching ? new Set(options.touching) : null
  const found = new Map<string, { path: AttackPath; nodes: string[] }>()

  for (const entry of entries) {
    const reached = await reach(reader, entry, options.maxDepth)
    const all = [...reached.values()]
    const sources = all.filter((n) => has(n, SOURCE_KINDS)).sort((a, b) => a.depth - b.depth)
    if (sources.length === 0) continue
    const sinks = all.filter((n) => has(n, SINK_KINDS)).sort((a, b) => a.depth - b.depth).slice(0, MAX_SINKS_PER_ENTRY)
    for (const sinkNode of sinks) {
      const joined = [sinkNode, ...sources.slice(0, MAX_SOURCES_PER_PATH)].flatMap((n) => chain(reached, keyOf(n)))
      const nodes = [...new Map(joined.map((n) => [keyOf(n), n])).values()]
      if (touching && !nodes.some((n) => touching.has(n.path))) continue
      const hops: PathHop[] = []
      for (const n of nodes.sort((a, b) => a.depth - b.depth)) if (n.facts.length > 0) hops.push(hopOf(await refOf(reader, repo, n), n.facts))
      const sink = sinkNode.facts.find((f) => SINK_KINDS.includes(f.kind))!.kind
      const key = [sink, ...hops.map((h) => `${h.ref.path}:${h.ref.name}`).sort()].join("\0")
      if (found.has(key)) continue
      const entryRef = entry.symbol === null ? { path: entry.path } : await refOf(reader, repo, entry)
      const newest = Math.max(...nodes.flatMap((n) => n.facts.map((f) => f.at.getTime())))
      const ranked = score(hops, sink, now.getTime() - newest < RECENT_PATH_DAYS * DAY_MS, weakened, options.newAuthors)
      found.set(key, { path: { entry: entryRef, hops, sink, score: ranked }, nodes: nodes.map((n) => n.path) })
    }
  }
  return [...found.values()].sort((a, b) => b.path.score - a.path.score).slice(0, options.limit)
}

function score(hops: PathHop[], sink: FactKind, recent: boolean, weakened: boolean, newAuthors?: Set<string>): number {
  const commits = new Set(hops.map((h) => h.commit)).size
  const authors = new Set(hops.map((h) => h.author).filter(Boolean))
  return (
    commits * 2 +
    authors.size * 2 +
    (recent ? 2 : 0) +
    ([...authors].some((a) => newAuthors?.has(a!)) ? 3 : 0) +
    (weakened ? 3 : 0) +
    (sink === "eval" || sink === "process" ? 1 : 0)
  )
}
