import { replaceFileSymbols, writeFileFacts, writeIndex, type Attribution } from "@/lib/db"
import { tokenize } from "@/lib/tokens"
import { extractFacts, pathReferences } from "./facts"
import type { FileState } from "./incremental"
import { MAX_SYMBOLS_PER_FILE } from "./limits"
import { extractSymbols, type SymbolDraft } from "./symbols"

export type IndexedFile = { path: string; blobSha: string; text: string | null }

// `tokens` is null for a file with no text to index (binary).
export type AnalysedFile = FileState & { path: string; blobSha: string; tokens: string[] | null; size: number }

export async function analyseFile(file: IndexedFile): Promise<AnalysedFile> {
  const parsed = file.text === null ? null : await extractSymbols(file.path, file.text)
  const refs = file.text === null ? [] : pathReferences(file.path, file.text.split("\n"))
  const facts = await extractFacts({ path: file.path, source: file.text }, parsed)
  return {
    path: file.path,
    blobSha: file.blobSha,
    symbols: [...(parsed ?? []), ...refs].slice(0, MAX_SYMBOLS_PER_FILE),
    facts,
    tokens: file.text === null ? null : tokenize(file.text),
    size: file.text?.length ?? 0,
  }
}

// A baseline (install or backfill) credits no author and records no "weakened"
// change, since nothing changed.
export async function writeAnalysed(
  repo: string,
  files: AnalysedFile[],
  credit: (path: string) => Attribution,
  options: { baseline: boolean; removed?: string[] },
): Promise<Map<string, SymbolDraft[]>> {
  const removed = options.removed ?? []
  const indexed = files.flatMap((f) => (f.tokens === null ? [] : [{ path: f.path, blobSha: f.blobSha, size: f.size, tokens: f.tokens }]))
  await writeIndex(repo, indexed, removed)
  await replaceFileSymbols(repo, files.map((f) => ({ path: f.path, blobSha: f.blobSha, symbols: f.symbols })), removed)
  await writeFileFacts(
    repo,
    files.map((f) => ({ path: f.path, by: credit(f.path), facts: options.baseline ? f.facts.filter((x) => x.kind !== "defense_weakened") : f.facts })),
    removed,
  )
  return new Map(files.map((f) => [f.path, f.symbols]))
}

// Tokens, symbols and facts for files already read.
export async function indexFiles(
  repo: string,
  files: IndexedFile[],
  credit: (path: string) => Attribution,
  options: { baseline: boolean; removed?: string[] },
): Promise<Map<string, SymbolDraft[]>> {
  const analysed = []
  for (const file of files) analysed.push(await analyseFile(file))
  return writeAnalysed(repo, analysed, credit, options)
}
