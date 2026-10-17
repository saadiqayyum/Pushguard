import { tool } from "@langchain/core/tools"
import { z } from "zod"
import { compact, compactLine } from "@/lib/compact"
import { fence } from "@/lib/fence"
import { allowPath, type ToolScope } from "@/lib/review-scope"
import { logger } from "@/lib/logger"
import type { AttackPath, Fact, HistoryEntry, SymbolRef } from "@/lib/code-intel"

export const MAX_FILE_CHARS = 40_000
export const MAX_TOOL_OUTPUT_CHARS = 12_000
export const MAX_LINES_PER_READ = 200
export const MAX_REFERENCE_RESULTS = 40
export const MAX_INTEL_RESULTS = 30
export const MAX_HISTORY_RESULTS = 10
export const MAX_TRACE_DEPTH = 6
export const MAX_TRACE_PATHS = 10
const MAX_SYMBOL_CHARS = 200

export type ToolTrace = {
  calls: number
  outputChars: number
  reads: string[]
  // Paths the model asked for and was refused. A rule reaching outside its own
  // scope is itself worth reporting.
  refused: { path: string; reason: string }[]
  // Files handed back shortened. A review that read half a file has a blind
  // spot in it, and saying so is the difference from having read it all.
  truncated: string[]
  failed: string[]
}

// Every reader is already bound to one repository at one commit by the caller,
// so neither the repo, the SHA nor a credential is an argument a model can set.
export type ToolReaders = {
  readBlob: (path: string) => Promise<string | null>
  findRefs: (symbol: string, limit: number) => Promise<string[]>
  findDefinitions: (name: string, limit: number) => Promise<SymbolRef[]>
  findUsages: (name: string, limit: number) => Promise<SymbolRef[]>
  symbolsInFile: (path: string, limit: number) => Promise<SymbolRef[]>
  factsFor: (query: { symbol?: string; path?: string; limit: number }) => Promise<Fact[]>
  historyOf: (query: { path?: string; symbol?: string }, limit: number) => Promise<HistoryEntry[]>
  tracePaths: (query: { maxDepth: number; limit: number }) => Promise<AttackPath[]>
}

// Applied to file text before the model sees it: the comment-stripped pass of
// the investigator reads through the same tools with comments removed.
export type ToolOptions = { transform?: (path: string, source: string) => string; withFiles?: boolean }

export type ToolSpec = {
  name: string
  description: string
  schema: z.ZodObject<z.ZodRawShape>
  run: (args: Record<string, unknown>) => Promise<string>
}

const symbol = z.string().min(1).max(MAX_SYMBOL_CHARS).describe("An identifier.")
const repoPath = z.string().min(1).max(1024).describe("Repository-relative path, such as src/index.ts.")
const target = z.object({ symbol: symbol.optional(), path: repoPath.optional() })

// Cut to the cap, say so, and fence: tool output is file-derived and untrusted.
export function capOutput(name: string, text: string, cap = MAX_TOOL_OUTPUT_CHARS): { text: string; cut: boolean } {
  const cut = text.length > cap
  const body = cut ? `${text.slice(0, cap)}\n\n[Cut at ${cap} characters; ${text.length - cap} more were not shown.]` : text
  return { text: fence("tool_result", { name }, body), cut }
}

const refLine = (ref: SymbolRef) =>
  `- ${ref.kind} ${ref.name} at ${ref.path}:${ref.line}${ref.endLine && ref.endLine > ref.line ? `-${ref.endLine}` : ""}`
const historyLine = (e: HistoryEntry) =>
  `- ${e.commit.slice(0, 7)} ${new Date(e.at).toISOString().slice(0, 10)} by ${e.author ?? "unknown"}: ${e.kinds.join(", ")}`

export function reviewTools(scope: ToolScope, readers: ToolReaders, options: ToolOptions = {}) {
  const trace: ToolTrace = { calls: 0, outputChars: 0, reads: [], refused: [], truncated: [], failed: [] }
  const cache = new Map<string, Promise<string | null>>()
  const inScope = (path: string) => allowPath(scope, path).ok

  const guard = (path: string): { ok: true; path: string } | { ok: false; message: string } => {
    const verdict = allowPath(scope, path)
    if (verdict.ok) return verdict
    trace.refused.push({ path: path.slice(0, 200), reason: verdict.reason })
    logger.warn("review_tool_path_refused", { repo: scope.repo, path: path.slice(0, 200), reason: verdict.reason })
    return { ok: false, message: `Refused: ${verdict.reason}.` }
  }

  const source = async (path: string): Promise<string | null> => {
    if (!cache.has(path)) cache.set(path, readers.readBlob(path))
    const raw = await cache.get(path)!
    if (raw === null) return null
    if (!trace.reads.includes(path)) trace.reads.push(path)
    return options.transform ? options.transform(path, raw) : raw
  }

  const specs: ToolSpec[] = [
    {
      name: "read_file",
      description: "Read one file from this repository at the commit under review.",
      schema: z.object({ path: repoPath }),
      run: async ({ path }) => {
        const allowed = guard(String(path))
        if (!allowed.ok) return allowed.message
        const text = await source(allowed.path)
        if (text === null) return "File could not be read: binary, missing, or too large."
        const { text: compacted, truncated } = compact(text)
        if (truncated > 0 || compacted.length > MAX_FILE_CHARS) trace.truncated.push(allowed.path)
        const body =
          truncated > 0 ? `${compacted}\n\n[${truncated} very long line(s) were cut. This file is partly unread.]` : compacted
        return body.length > MAX_FILE_CHARS
          ? `${body.slice(0, MAX_FILE_CHARS)}\n\n[Cut at ${MAX_FILE_CHARS} characters; ${body.length - MAX_FILE_CHARS} more were not shown. This file is partly unread.]`
          : body
      },
    },
    {
      name: "find_references",
      description: "List files that mention a name. Mentions, not resolved call sites.",
      schema: z.object({ symbol }),
      run: async ({ symbol: name }) => {
        const hits = (await readers.findRefs(String(name), MAX_REFERENCE_RESULTS)).filter(inScope)
        if (hits.length === 0) return `No indexed file mentions ${name}.`
        return [`Files mentioning ${name}:`, ...hits.map((path) => `- ${path}`)].join("\n")
      },
    },
    {
      name: "read_lines",
      description: `Read a numbered line range of one file, at most ${MAX_LINES_PER_READ} lines per call.`,
      schema: z.object({
        path: repoPath,
        start: z.number().int().min(1),
        end: z.number().int().min(1),
      }),
      run: async ({ path, start, end }) => {
        const allowed = guard(String(path))
        if (!allowed.ok) return allowed.message
        const text = await source(allowed.path)
        if (text === null) return "File could not be read: binary, missing, or too large."
        const lines = text.split("\n")
        const from = Math.max(1, Number(start))
        const to = Math.min(lines.length, Number(end), from + MAX_LINES_PER_READ - 1)
        if (from > lines.length) return `The file has ${lines.length} lines.`
        const body = lines
          .slice(from - 1, to)
          .map((line, i) => `${from + i}| ${compactLine(line).text}`)
          .join("\n")
        return Number(end) > to ? `${body}\n[Stopped at line ${to} of ${lines.length}.]` : body
      },
    },
    {
      name: "find_definition",
      description: "Where a symbol is defined, from the parsed symbol index.",
      schema: z.object({ symbol }),
      run: async ({ symbol: name }) => {
        const refs = (await readers.findDefinitions(String(name), MAX_INTEL_RESULTS)).filter((r) => inScope(r.path))
        return refs.length === 0 ? `No definition of ${name} is indexed.` : refs.map(refLine).join("\n")
      },
    },
    {
      name: "find_usages",
      description: "Where a symbol is referenced, from the parsed symbol index.",
      schema: z.object({ symbol }),
      run: async ({ symbol: name }) => {
        const refs = (await readers.findUsages(String(name), MAX_INTEL_RESULTS)).filter((r) => inScope(r.path))
        return refs.length === 0 ? `No usage of ${name} is indexed.` : refs.map(refLine).join("\n")
      },
    },
    {
      name: "facts_for",
      description: "Capability facts (network, exec, env, crypto...) recorded for a symbol or a file, newest first.",
      schema: target,
      run: async ({ symbol: name, path }) => {
        if (!name && !path) return "Give a symbol or a path."
        if (path && !guard(String(path)).ok) return `Refused: ${path} is outside this review.`
        const facts = (
          await readers.factsFor({
            symbol: name ? String(name) : undefined,
            path: path ? String(path) : undefined,
            limit: MAX_INTEL_RESULTS,
          })
        ).filter((f) => inScope(f.path))
        if (facts.length === 0) return "No facts recorded."
        return facts
          .map(
            (f) =>
              `- ${f.kind} in ${f.symbol ?? "(file)"} at ${f.path}:${f.line ?? "?"}, ${f.commit.slice(0, 7)} by ${f.author ?? "unknown"}: ${f.detail}`,
          )
          .join("\n")
      },
    },
    {
      name: "history_of",
      description: "Commits that changed a symbol or a file, newest first.",
      schema: target,
      run: async ({ symbol: name, path }) => {
        if (!name && !path) return "Give a symbol or a path."
        if (path && !guard(String(path)).ok) return `Refused: ${path} is outside this review.`
        const entries = await readers.historyOf(
          { symbol: name ? String(name) : undefined, path: path ? String(path) : undefined },
          MAX_HISTORY_RESULTS,
        )
        if (entries.length === 0) return "No history recorded."
        return entries.map(historyLine).join("\n")
      },
    },
    {
      name: "blame",
      description: "Who last changed the symbol enclosing one line of a file.",
      schema: z.object({ path: repoPath, line: z.number().int().min(1) }),
      run: async ({ path, line }) => {
        const allowed = guard(String(path))
        if (!allowed.ok) return allowed.message
        const at = Number(line)
        const enclosing = (await readers.symbolsInFile(allowed.path, MAX_INTEL_RESULTS)).find(
          (s) => s.role === "definition" && s.line <= at && at <= (s.endLine ?? s.line),
        )
        const entries = await readers.historyOf(
          enclosing ? { symbol: enclosing.name } : { path: allowed.path },
          3,
        )
        const subject = enclosing ? `${enclosing.kind} ${enclosing.name}` : "the file"
        if (entries.length === 0) return `No history recorded for ${subject}.`
        return [
          `Line ${at} is in ${subject}. Last changes:`,
          ...entries.map(historyLine),
        ].join("\n")
      },
    },
    {
      name: "trace_paths",
      description: "Candidate source-to-sink paths through this repository, highest score first.",
      schema: z.object({}),
      run: async () => {
        const paths = (await readers.tracePaths({ maxDepth: MAX_TRACE_DEPTH, limit: MAX_TRACE_PATHS })).filter((p) =>
          [p.entry, ...p.hops.map((h) => h.ref)].every((r) => inScope(r.path)),
        )
        if (paths.length === 0) return "No candidate paths."
        return paths
          .map((p, n) =>
            [
              `Path ${n + 1} (score ${p.score}): ${"name" in p.entry ? p.entry.name : p.entry.path} -> ${p.sink}`,
              ...p.hops.map(
                (h, i) => `  ${i + 1}. ${refLine(h.ref).slice(2)} [${h.facts.join(", ")}] ${h.commit.slice(0, 7)} by ${h.author ?? "unknown"}`,
              ),
            ].join("\n"),
          )
          .join("\n")
      },
    },
  ]

  const wrapped: ToolSpec[] = specs
    .filter((spec) => options.withFiles !== false || spec.name !== "read_file")
    .map((spec) => ({
      ...spec,
      run: async (args) => {
        trace.calls++
        if (trace.calls > scope.budget) {
          return `Budget of ${scope.budget} tool calls is spent. Report what you already have.`
        }
        const raw = await spec.run(args).catch((error: unknown) => {
          if (!trace.failed.includes(spec.name)) trace.failed.push(spec.name)
          logger.warn("review_tool_failed", { repo: scope.repo, tool: spec.name, error: String(error) })
          return "This tool could not answer. Treat what it would have shown as unknown, not as clean."
        })
        const { text } = capOutput(spec.name, raw, spec.name === "read_file" ? MAX_FILE_CHARS + 200 : MAX_TOOL_OUTPUT_CHARS)
        trace.outputChars += text.length
        return text
      },
    }))

  const tools = wrapped.map((spec) =>
    tool(async (args: Record<string, unknown>) => spec.run(args), {
      name: spec.name,
      description: spec.description,
      schema: spec.schema,
    }),
  )

  return { specs: wrapped, tools, trace }
}
