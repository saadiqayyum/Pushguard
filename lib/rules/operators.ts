// Editor operators over the two pattern languages rules already store. Nothing
// new reaches the schema or engine: an operator is compiled to a regex or glob,
// and read back from its shape, so the ReDoS check and matching are unchanged.

export const OPERATORS = ["contains", "equals", "starts_with", "ends_with", "matches"] as const
export type Operator = (typeof OPERATORS)[number]

export const OPERATOR_LABELS: Record<Operator, string> = {
  contains: "contains",
  equals: "equals",
  starts_with: "starts with",
  ends_with: "ends with",
  matches: "matches",
}

export type Operand = { op: Operator; value: string }

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/g
const escapeRegex = (text: string) => text.replace(REGEX_SPECIAL, "\\$&")

// A literal is text whose every special character is escaped.
function unescapeRegex(source: string): string | null {
  let out = ""
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (c === "\\") {
      const next = source[i + 1]
      if (next === undefined || !/[.*+?^${}()|[\]\\]/.test(next)) return null
      out += next
      i++
    } else if (/[.*+?^${}()|[\]]/.test(c)) {
      return null
    } else {
      out += c
    }
  }
  return out
}

export function toRegex({ op, value }: Operand): string {
  if (op === "matches") return value
  const literal = escapeRegex(value)
  if (op === "equals") return `^${literal}$`
  if (op === "starts_with") return `^${literal}`
  if (op === "ends_with") return `${literal}$`
  return literal
}

export function fromRegex(source: string): Operand {
  const anchoredStart = source.startsWith("^")
  const anchoredEnd = source.endsWith("$") && !source.endsWith("\\$")
  const body = source.slice(anchoredStart ? 1 : 0, anchoredEnd ? -1 : undefined)
  const literal = body === "" ? null : unescapeRegex(body)
  if (literal === null) return { op: "matches", value: source }
  if (anchoredStart && anchoredEnd) return { op: "equals", value: literal }
  if (anchoredStart) return { op: "starts_with", value: literal }
  if (anchoredEnd) return { op: "ends_with", value: literal }
  return { op: "contains", value: literal }
}

const GLOB_SPECIAL = /[*?[\]{}()!+@]/
const isPlainPath = (text: string) => text !== "" && !GLOB_SPECIAL.test(text)

export function toGlob({ op, value }: Operand): string {
  if (op === "matches" || !isPlainPath(value)) return value
  const trimmed = value.replace(/^\/+|\/+$/g, "")
  if (op === "equals") return trimmed
  if (op === "starts_with") return `${trimmed}/**`
  if (op === "ends_with") return `**/*${trimmed}`
  return `**/*${trimmed}*`
}

export function fromGlob(glob: string): Operand {
  const startsWith = /^([^*?[\]{}()!+@]+)\/\*\*$/.exec(glob)
  if (startsWith) return { op: "starts_with", value: startsWith[1] }
  const contains = /^\*\*\/\*([^*?[\]{}()!+@/]+)\*$/.exec(glob)
  if (contains) return { op: "contains", value: contains[1] }
  const endsWith = /^\*\*\/\*([^*?[\]{}()!+@/]+)$/.exec(glob)
  if (endsWith) return { op: "ends_with", value: endsWith[1] }
  if (isPlainPath(glob)) return { op: "equals", value: glob }
  return { op: "matches", value: glob }
}
