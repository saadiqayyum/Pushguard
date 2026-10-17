import { collectPatchLines, type FileLines } from "@/lib/diff-lines"
import type { CompareFile } from "@/lib/github"

export type PushDiff = {
  base: string
  head: string
  files: CompareFile[]
  addedLines: FileLines
  removedLines: FileLines
  truncated: boolean
  filesCapped: boolean
  unread: string[]
}

// `unread` is a file GitHub changed but sent no patch for: too large, not
// binary (a binary file reports no line changes). Its content was never seen.
export function toPushDiff(base: string, head: string, compared: { files: CompareFile[]; truncated: boolean }): PushDiff {
  const lines = collectPatchLines(compared.files)
  return {
    base,
    head,
    files: compared.files,
    addedLines: lines.added,
    removedLines: lines.removed,
    truncated: compared.truncated || lines.truncated,
    filesCapped: compared.truncated,
    unread: compared.files.filter((f) => f.patch === undefined && f.additions + f.deletions > 0).map((f) => f.path),
  }
}
