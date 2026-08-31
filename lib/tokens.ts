// Identifiers in a file, for answering "where else is this name used".

// Two characters is a loop counter; the index is for names worth searching.
const IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_$]{2,}/g

// Names so common that every file has them, so indexing them costs storage on
// every document and narrows nothing when queried.
const NOISE = new Set([
  "the", "and", "for", "not", "with", "this", "that", "from", "type", "const", "let", "var",
  "function", "return", "import", "export", "default", "class", "extends", "implements",
  "interface", "public", "private", "protected", "static", "async", "await", "new", "delete",
  "true", "false", "null", "undefined", "void", "string", "number", "boolean", "object",
  "if", "else", "switch", "case", "break", "continue", "while", "try", "catch", "finally",
  "throw", "typeof", "instanceof", "def", "self", "elif", "None", "True", "False", "pass",
  "lambda", "func", "package", "struct", "err", "nil", "end", "module", "require", "use",
])

// One document may not carry an unbounded array; a generated file has thousands.
export const MAX_TOKENS_PER_FILE = 1_000

// The distinct, searchable names in a file.
export function tokenize(source: string): string[] {
  const seen = new Set<string>()
  for (const match of source.matchAll(IDENTIFIER)) {
    const token = match[0].toLowerCase()
    if (NOISE.has(token)) continue
    seen.add(token)
    if (seen.size >= MAX_TOKENS_PER_FILE) break
  }
  return [...seen]
}

// The same normalisation on the way in as on the way out, or nothing matches.
export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toLowerCase()
}
