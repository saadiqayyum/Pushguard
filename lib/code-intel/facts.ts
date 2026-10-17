import { posix } from "node:path"
import picomatch from "picomatch"
import { confirmContentMatches, evaluateRules, type PushContext } from "@/lib/engine"
import { catalogRules } from "@/lib/rules/catalog"
import {
  COMMENT_LINE,
  LINE_PATTERNS,
  PATH_REFERENCE,
  RULE_FACTS,
  SECRET_PATTERNS,
  SURFACES,
  URL_HOST,
  XRAY_FACTS,
  type LinePattern,
} from "./fact-patterns"
import { MAX_FACT_DETAIL, MAX_FACTS_PER_FILE, MAX_SYMBOLS_PER_FILE, OPAQUE_ENTROPY_BITS, OPAQUE_LITERAL_MIN } from "./limits"
import { enclosingSymbol, type SymbolDraft } from "./symbols"
import type { FactDraft } from "./types"

export type SourceFile = { path: string; source: string | null }

const surfaces = SURFACES.map((s) => ({ ...s, match: picomatch(s.globs, { dot: true }) }))
const factRules = catalogRules.filter((rule) => rule.id in RULE_FACTS)
const LONG_LITERAL = new RegExp(`(["'\`])([^"'\`\\s]{${OPAQUE_LITERAL_MIN},})\\1`, "g")
export const JS_PARSEABLE = /\.(?:js|mjs|cjs|jsx)$/i

function entropy(text: string): number {
  const counts = new Map<string, number>()
  for (const c of text) counts.set(c, (counts.get(c) ?? 0) + 1)
  let bits = 0
  for (const n of counts.values()) bits -= (n / text.length) * Math.log2(n / text.length)
  return bits
}

function ruleHits(path: string, lines: string[]): { kind: FactDraft["kind"]; rule: string; line: number | null }[] {
  const context: PushContext = {
    repo: "",
    branch: "",
    forced: false,
    senderFirstPush: false,
    branchCreated: false,
    branchDeleted: false,
    authorMismatch: false,
    unreviewed: false,
    hourUtc: 12,
    files: [{ path, changeType: "added" }],
    commitMessages: [],
  }
  return confirmContentMatches(evaluateRules(factRules, context), new Map([[path, lines]])).map((m) => {
    const at = m.matchedLines.length > 0 ? lines.indexOf(m.matchedLines[0]) : -1
    return { kind: RULE_FACTS[m.rule.id], rule: m.rule.id, line: at >= 0 ? at + 1 : null }
  })
}

async function xrayHits(source: string): Promise<{ kind: FactDraft["kind"]; label: string; line: number | null }[]> {
  try {
    const { AstAnalyser } = await import("@nodesecure/js-x-ray")
    return new AstAnalyser().analyse(source).warnings.flatMap((w) => {
      const kind = XRAY_FACTS[w.kind]
      if (!kind) return []
      const first = (w.location ?? []).flat(2)[0]
      return [{ kind, label: `xray-${w.kind}`, line: typeof first === "number" ? first : null }]
    })
  } catch {
    return []
  }
}

function lineDetail(pattern: LinePattern, line: string, match: RegExpExecArray): string {
  const extra = (pattern.group ? match[pattern.group] : undefined) ?? (pattern.kind === "network" ? URL_HOST.exec(line)?.[1] : undefined)
  return extra ? `${pattern.label} ${extra}` : pattern.label
}

// Paths a file names, resolved the way the tool that reads it would.
export function pathReferences(file: string, lines: string[]): SymbolDraft[] {
  const base = posix.basename(file) === "package.json" ? posix.dirname(file) : "."
  const refs: SymbolDraft[] = []
  lines.forEach((text, i) => {
    for (const match of text.matchAll(PATH_REFERENCE)) {
      const target = posix.normalize(posix.join(base, match[1]))
      if (target === file || target.startsWith("..")) continue
      refs.push({ path: file, name: target, kind: "module", role: "reference", line: i + 1, endLine: null })
    }
  })
  return refs.slice(0, MAX_SYMBOLS_PER_FILE)
}

// Capabilities in one file, deterministic and IO-free. A null source is a file
// GitHub would not serve as text, which is itself the fact.
export async function extractFacts(file: SourceFile, symbols: SymbolDraft[] | null): Promise<FactDraft[]> {
  const facts = new Map<string, FactDraft>()
  const add = (kind: FactDraft["kind"], detail: string, line: number | null) => {
    const symbol = line === null || !symbols ? null : enclosingSymbol(symbols, line)
    const fact = { path: file.path, symbol, kind, detail: detail.slice(0, MAX_FACT_DETAIL), line }
    const key = [symbol, kind, fact.detail].join("\0")
    if (!facts.has(key) && facts.size < MAX_FACTS_PER_FILE) facts.set(key, fact)
  }

  for (const surface of surfaces) if (surface.match(file.path)) add(surface.kind, surface.label, null)
  if (file.source === null) {
    add("opaque_blob", "binary", null)
    return [...facts.values()]
  }

  const lines = file.source.split("\n")
  for (const hit of ruleHits(file.path, lines)) add(hit.kind, hit.rule, hit.line)
  if (JS_PARSEABLE.test(file.path)) for (const hit of await xrayHits(file.source)) add(hit.kind, hit.label, hit.line)

  lines.forEach((text, i) => {
    if (COMMENT_LINE.test(text)) return
    const line = i + 1
    const scope = `${file.path} ${symbols ? enclosingSymbol(symbols, line) ?? "" : ""}`
    const applies = (p: LinePattern) => (!p.files || p.files.test(file.path)) && (!p.scope || p.scope.test(scope))
    const secret = SECRET_PATTERNS.filter(applies).find((p) => p.pattern.test(text))
    if (secret) add("secret_read", lineDetail(secret, text, secret.pattern.exec(text)!), line)
    for (const p of LINE_PATTERNS) {
      if (!applies(p) || (secret && p.kind === "env_read")) continue
      const match = p.pattern.exec(text)
      if (match) add(p.kind, lineDetail(p, text, match), line)
    }
    for (const literal of text.matchAll(LONG_LITERAL)) {
      if (entropy(literal[2]) >= OPAQUE_ENTROPY_BITS) add("opaque_blob", `high-entropy-literal ${literal[2].length}`, line)
    }
  })
  return [...facts.values()]
}
