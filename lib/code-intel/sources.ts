import { patchLines } from "@/lib/diff-lines"
import type { CompareFile } from "@/lib/github"
import { INTEL_FILE, SOURCE_FILE } from "@/lib/source-files"

export type IntelSources = {
  whole: { path: string; sha: string; text: string }[]
  patched: { path: string; from: string; sha: string; patch: string }[]
  fetch: string[]
}

const indexable = (path: string) => SOURCE_FILE.test(path) || INTEL_FILE.test(path)

// A new file's patch is the whole file; an edit is applied to what the index holds for its old
// path. A blob is read only without a patch or prior state, and only where the index job would read.
export function intelSources(paths: string[], compared: Map<string, CompareFile> | null, indexed: Set<string>): IntelSources {
  const out: IntelSources = { whole: [], patched: [], fetch: [] }
  for (const path of paths) {
    const file = compared?.get(path)
    if (!file) {
      if (indexable(path)) out.fetch.push(path)
      continue
    }
    const sha = file.sha ?? ""
    const changes = file.additions + file.deletions
    if (file.status === "added" && file.patch !== undefined) {
      out.whole.push({ path, sha, text: patchLines(file.patch).added.join("\n") })
      continue
    }
    const from = file.previousPath ?? path
    const patch = file.patch ?? (file.status === "renamed" && changes === 0 ? "" : undefined)
    if (patch !== undefined && file.status !== "copied" && indexed.has(from)) {
      out.patched.push({ path, from, sha, patch })
    } else if (indexable(path) && (changes > 0 || file.status === "added" || file.status === "copied")) {
      out.fetch.push(path)
    }
  }
  return out
}
