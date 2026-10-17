import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { Language, Parser, Query } from "web-tree-sitter"

// Grammars and their official tags queries, read from node_modules at runtime.
// next.config.ts traces these files into the job route's bundle.
type Grammar = { wasm: string; tags: string[]; extra?: string }

const JS_TAGS = "tree-sitter-javascript/queries/tags.scm"
const TS_TAGS = "tree-sitter-typescript/queries/tags.scm"

// The official queries skip value uses and top-level constants, which is how
// data reaches a sink: `[...v]`, `pack(settings)`, `Layer.run()`.
const JS_EXTRA = `
(call_expression function: (member_expression object: (identifier) @name)) @reference.call
(arguments (identifier) @name) @reference.variable
(spread_element (identifier) @name) @reference.variable
(program (lexical_declaration (variable_declarator name: (identifier) @name) @definition.variable))
(export_statement (lexical_declaration (variable_declarator name: (identifier) @name) @definition.variable))
`
const PY_EXTRA = `(call arguments: (argument_list (identifier) @name)) @reference.variable`

const GRAMMARS: Record<string, Grammar> = {
  javascript: { wasm: "tree-sitter-javascript/tree-sitter-javascript.wasm", tags: [JS_TAGS], extra: JS_EXTRA },
  typescript: { wasm: "tree-sitter-typescript/tree-sitter-typescript.wasm", tags: [JS_TAGS, TS_TAGS], extra: JS_EXTRA },
  tsx: { wasm: "tree-sitter-typescript/tree-sitter-tsx.wasm", tags: [JS_TAGS, TS_TAGS], extra: JS_EXTRA },
  python: { wasm: "tree-sitter-python/tree-sitter-python.wasm", tags: ["tree-sitter-python/queries/tags.scm"], extra: PY_EXTRA },
  go: { wasm: "tree-sitter-go/tree-sitter-go.wasm", tags: ["tree-sitter-go/queries/tags.scm"] },
  rust: { wasm: "tree-sitter-rust/tree-sitter-rust.wasm", tags: ["tree-sitter-rust/queries/tags.scm"] },
  java: { wasm: "tree-sitter-java/tree-sitter-java.wasm", tags: ["tree-sitter-java/queries/tags.scm"] },
  ruby: { wasm: "tree-sitter-ruby/tree-sitter-ruby.wasm", tags: ["tree-sitter-ruby/queries/tags.scm"] },
  php: { wasm: "tree-sitter-php/tree-sitter-php.wasm", tags: ["tree-sitter-php/queries/tags.scm"] },
}

const EXTENSIONS: [RegExp, string][] = [
  [/\.(?:js|mjs|cjs|jsx)$/i, "javascript"],
  [/\.(?:ts|mts|cts)$/i, "typescript"],
  [/\.tsx$/i, "tsx"],
  [/\.py$/i, "python"],
  [/\.go$/i, "go"],
  [/\.rs$/i, "rust"],
  [/\.java$/i, "java"],
  [/\.rb$/i, "ruby"],
  [/\.php$/i, "php"],
]

export function languageOf(path: string): string | null {
  return EXTENSIONS.find(([pattern]) => pattern.test(path))?.[1] ?? null
}

const modules = () => join(process.cwd(), "node_modules")
const loaded = new Map<string, Promise<{ parser: Parser; query: Query }>>()
let ready: Promise<void> | null = null

async function load(name: string): Promise<{ parser: Parser; query: Query }> {
  ready ??= Parser.init({ locateFile: () => join(modules(), "web-tree-sitter/web-tree-sitter.wasm") })
  await ready
  const grammar = GRAMMARS[name]
  const language = await Language.load(await readFile(join(modules(), grammar.wasm)))
  const tags = await Promise.all(grammar.tags.map((file) => readFile(join(modules(), file), "utf8")))
  const parser = new Parser()
  parser.setLanguage(language)
  return { parser, query: new Query(language, [...tags, grammar.extra ?? ""].join("\n")) }
}

export function grammarFor(name: string): Promise<{ parser: Parser; query: Query }> {
  let entry = loaded.get(name)
  if (!entry) {
    entry = load(name)
    entry.catch(() => loaded.delete(name))
    loaded.set(name, entry)
  }
  return entry
}
