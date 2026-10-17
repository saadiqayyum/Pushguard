// Comments in attacker-written code, separated from the code. The investigator
// reads both ways; text in comments that addresses a reviewer is a finding.

type Syntax = {
  line: string[]
  block: [string, string][]
  strings: string[]
  docstrings?: boolean
}

const C_LIKE: Syntax = { line: ["//"], block: [["/*", "*/"]], strings: ['"', "'", "`"] }
const HASH: Syntax = { line: ["#"], block: [], strings: ['"', "'"] }

const SYNTAX: [RegExp, Syntax][] = [
  [/\.(?:js|mjs|cjs|jsx|ts|tsx|mts|cts|go|rs|java|kt|scala|cs|c|h|cc|cpp|hpp|swift|dart)$/i, C_LIKE],
  [/\.php$/i, { ...C_LIKE, line: ["//", "#"] }],
  [/\.py$/i, { ...HASH, docstrings: true }],
  [/\.(?:rb|sh|bash|zsh|pl|ya?ml|ex|exs)$/i, HASH],
  [/\.ps1$/i, { ...HASH, block: [["<#", "#>"]] }],
  [/\.tf$/i, { line: ["#", "//"], block: [["/*", "*/"]], strings: ['"'] }],
  [/\.lua$/i, { line: ["--"], block: [["--[[", "]]"]], strings: ['"', "'"] }],
  [/\.sql$/i, { line: ["--"], block: [["/*", "*/"]], strings: ["'", '"'] }],
]

export function syntaxFor(path: string): Syntax | null {
  return SYNTAX.find(([pattern]) => pattern.test(path))?.[1] ?? null
}

export type Split = { code: string; comments: Map<number, string> }

// ponytail: a lexer, not a parser. Regex literals and nested template strings
// can fool it; tree-sitter per language if that ever matters to a verdict.
export function splitComments(source: string, path: string): Split {
  const syntax = syntaxFor(path)
  const comments = new Map<number, string>()
  if (!syntax) return { code: source, comments }

  const blocks: [string, string][] = [
    ...(syntax.docstrings ? ([['"""', '"""'], ["'''", "'''"]] as [string, string][]) : []),
    ...syntax.block,
  ]
  const tripleStrings = syntax.docstrings ? ['"""', "'''"] : []
  let code = ""
  let line = 1
  let i = 0
  let lineStart = true
  const note = (text: string) => comments.set(line, (comments.get(line) ?? "") + text)

  while (i < source.length) {
    const ch = source[i]
    if (ch === "\n") {
      code += ch
      line++
      i++
      lineStart = true
      continue
    }
    const rest = source.startsWith.bind(source)

    const block = blocks.find(([open]) => rest(open, i))
    const isDocstring = block && tripleStrings.includes(block[0])
    if (block && (!isDocstring || lineStart)) {
      const end = source.indexOf(block[1], i + block[0].length)
      const stop = end === -1 ? source.length : end + block[1].length
      for (const c of source.slice(i, stop)) {
        if (c === "\n") {
          code += c
          line++
        } else note(c)
      }
      i = stop
      continue
    }

    const opener = syntax.line.find((token) => rest(token, i))
    if (opener) {
      const end = source.indexOf("\n", i)
      const stop = end === -1 ? source.length : end
      note(source.slice(i, stop))
      i = stop
      continue
    }

    const quote = [...tripleStrings, ...syntax.strings].find((q) => rest(q, i))
    if (quote) {
      let j = i + quote.length
      while (j < source.length && !rest(quote, j)) {
        if (source[j] === "\\") j++
        else if (source[j] === "\n" && quote.length === 1 && quote !== "`") break
        j++
      }
      const stop = Math.min(source.length, rest(quote, j) ? j + quote.length : j)
      const literal = source.slice(i, stop)
      code += literal
      line += literal.split("\n").length - 1
      i = stop
      lineStart = false
      continue
    }

    code += ch
    if (ch !== " " && ch !== "\t") lineStart = false
    i++
  }
  return { code, comments }
}

export function stripComments(source: string, path: string): string {
  return splitComments(source, path).code
}

export const MAX_REVIEWER_LINES = 5
const MAX_REVIEWER_QUOTE = 200

// Comments that claim the code was checked, or speak to whoever checks it.
// ALIBI's strongest evasions fabricate tool results, so a claim is never evidence.
const REVIEWER_DIRECTED = [
  /\b(security|code)[\s-]*(reviewed|audited|approved|cleared|signed[\s-]*off)\b/i,
  /\b(scanner|sast|codeql|semgrep|snyk|bandit|static analysis|linter)\b.{0,40}\b(0|zero|no)\s+(findings?|issues?|alerts?|vulnerabilit(y|ies))\b/i,
  /\b(all\s+)?(tests?|checks?|ci)\s+(passed|pass|green)\b/i,
  /\b(this|it|code)\s+is\s+(safe|benign|harmless|not malicious)\b/i,
  /\bfalse[\s-]positive\b/i,
  /\b(ignore|disregard|forget)\b.{0,30}\b(previous|prior|above|earlier|all)\b.{0,20}\b(instructions?|rules?|prompts?)\b/i,
  /\b(note|attention|message|instructions?)\s+(to|for)\s+(the\s+)?(reviewer|auditor|ai|llm|model|scanner|assistant)s?\b/i,
  /\b(ai|llm|automated|model|assistant|copilot|claude|gpt)[\s-]+(reviewers?|reviews?|scanners?|auditors?)\b/i,
  /\b(do not|don't|no need to|never)\s+(flag|report|review|scan|alert)\b/i,
  /\b(verified|validated)\s+(upstream|safe|by\s+(security|the|our))\b/i,
]

export type ReviewerLine = { line: number; quote: string }

export function reviewerDirectedLines(source: string, path: string): ReviewerLine[] {
  const hits: ReviewerLine[] = []
  for (const [line, text] of splitComments(source, path).comments) {
    if (!REVIEWER_DIRECTED.some((pattern) => pattern.test(text))) continue
    hits.push({ line, quote: text.replace(/\s+/g, " ").trim().slice(0, MAX_REVIEWER_QUOTE) })
    if (hits.length >= MAX_REVIEWER_LINES) break
  }
  return hits
}
