import { BIDI_CONTROL, INVISIBLE } from "@/lib/engine"

// Shrinking source and diff text before a model reads it.

// Beyond this a line is minified or generated, and reading on says nothing.
export const MAX_LINE_CHARS = 2_000

// Runs of this many spaces or tabs *inside* a line are alignment, or hiding.
const INNER_PADDING = / {3,}|\t{2,}/g

export type Compacted = {
  text: string
  saved: number
  truncated: number
}

// `‮` -> `<U+202E>`. Visible, countable, and safe to put in a prompt.
function reveal(character: string): string {
  return `<U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}>`
}

// One line, minus what costs tokens and carries nothing.
export function compactLine(line: string): { text: string; truncated: boolean } {
  const indent = line.slice(0, line.length - line.trimStart().length)
  let body = line
    .slice(indent.length)
    .replace(INVISIBLE, reveal)
    .replace(BIDI_CONTROL, reveal)
    .replace(INNER_PADDING, " ")
    .trimEnd()

  const truncated = body.length > MAX_LINE_CHARS
  if (truncated) {
    body = `${body.slice(0, MAX_LINE_CHARS)} … [${body.length - MAX_LINE_CHARS} more characters on this line were not sent]`
  }
  return { text: indent + body, truncated }
}

// A whole file or diff, compacted.
export function compact(source: string): Compacted {
  const lines = source.split("\n")
  const out: string[] = []
  let truncated = 0
  let blanks = 0

  for (const line of lines) {
    const { text, truncated: cut } = compactLine(line)
    if (cut) truncated++
    if (text.trim() === "") {
      blanks++
      if (blanks > 1) continue
    } else {
      blanks = 0
    }
    out.push(text)
  }

  const text = out.join("\n")
  return { text, saved: source.length - text.length, truncated }
}
