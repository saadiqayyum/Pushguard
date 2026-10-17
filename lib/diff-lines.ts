// Added lines keyed by the path they were added to.
export type FileLines = Map<string, string[]>

// `+++` names a file only in a header block (after `diff --git`, before `@@`):
// an added line reading `++ b/README.md` must not re-attribute the hunk.
export function addedLinesByFile(diff: string, fallbackPaths: string[] = [""]): FileLines {
  const byFile: FileLines = new Map()
  let target: string[] | null = null
  let inHeader = true
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      inHeader = true
      target = null
    } else if (line.startsWith("@@")) {
      inHeader = false
    } else if (inHeader && line.startsWith("+++ ")) {
      const path = line.slice(4).replace(/^b\//, "")
      target = byFile.get(path) ?? []
      byFile.set(path, target)
    } else if (line.startsWith("+")) {
      if (!target) {
        target = []
        for (const path of fallbackPaths) byFile.set(path, target)
      }
      target.push(line.slice(1))
    }
  }
  return byFile
}

// Forty times the old 50 KB. The cap exists because a diff has to be held in memory.
export const DIFF_MAX_BYTES = 2_000_000
export const DIFF_READ_BUDGET = "2 MB"

export type Hunk = { oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[] }

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

// Lines before the first `@@` are headers; inside a hunk `++x` is content.
export function parseHunks(patch: string): Hunk[] {
  const hunks: Hunk[] = []
  for (const line of patch.split("\n")) {
    const header = HUNK_HEADER.exec(line)
    if (header) {
      const [, a, b, c, d] = header
      hunks.push({ oldStart: Number(a), oldLines: b === undefined ? 1 : Number(b), newStart: Number(c), newLines: d === undefined ? 1 : Number(d), lines: [] })
    } else if (hunks.length > 0 && /^[ +-]/.test(line)) {
      hunks[hunks.length - 1].lines.push(line)
    }
  }
  return hunks
}

export function patchLines(patch: string): { added: string[]; removed: string[] } {
  const lines = parseHunks(patch).flatMap((h) => h.lines)
  return {
    added: lines.filter((l) => l.startsWith("+")).map((l) => l.slice(1)),
    removed: lines.filter((l) => l.startsWith("-")).map((l) => l.slice(1)),
  }
}

// Added and removed lines per file, reading at most `budget` bytes of patch.
export function collectPatchLines(
  files: { path: string; patch?: string }[],
  budget = DIFF_MAX_BYTES,
): { added: FileLines; removed: FileLines; truncated: boolean } {
  const added: FileLines = new Map()
  const removed: FileLines = new Map()
  let left = budget
  for (const file of files) {
    if (!file.patch) continue
    if (left <= 0) return { added, removed, truncated: true }
    const slice = file.patch.slice(0, left)
    left -= slice.length
    const lines = patchLines(slice)
    added.set(file.path, [...(added.get(file.path) ?? []), ...lines.added])
    removed.set(file.path, [...(removed.get(file.path) ?? []), ...lines.removed])
  }
  return { added, removed, truncated: left <= 0 }
}
