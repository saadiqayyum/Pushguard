import * as intel from "@/lib/code-intel"
import { findReferences } from "@/lib/code-index"
import { fetchBlobs } from "@/lib/github"
import type { ToolReaders } from "@/lib/review-tools"

// The one place the tools' readers are bound to a repository and a ref. What a
// model may name is a path or a symbol; never these three.
export function scopedReaders(installationId: number, repo: string, ref: string): ToolReaders {
  return {
    readBlob: async (path) => (await fetchBlobs(installationId, repo, ref, [path])).files.get(path) ?? null,
    findRefs: (symbol, limit) => findReferences(repo, symbol, limit),
    findDefinitions: (name, limit) => intel.findDefinitions(repo, name, limit),
    findUsages: (name, limit) => intel.findUsages(repo, name, limit),
    symbolsInFile: (path, limit) => intel.symbolsInFile(repo, path, limit),
    factsFor: (query) => intel.factsFor(repo, query),
    historyOf: (query, limit) => intel.historyOf(repo, query, limit),
    tracePaths: (query) => intel.tracePaths(repo, query),
  }
}
