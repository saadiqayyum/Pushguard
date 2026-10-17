import type { Hunk } from "@/lib/diff-lines"

// Where an old line sits after the patch. A removed line is null, or with
// `removed: "before"` the new line just above it (for the end of a span).
export function shiftLine(hunks: Hunk[], line: number, removed: "null" | "before" = "null"): number | null {
  let delta = 0
  for (const h of hunks) {
    if (h.oldLines === 0 ? line <= h.oldStart : line < h.oldStart) return line + delta
    if (h.oldLines > 0 && line <= h.oldStart + h.oldLines - 1) {
      let oldAt = h.oldStart
      let newAt = h.newStart
      for (const l of h.lines) {
        if (l.startsWith("+")) {
          newAt++
          continue
        }
        if (oldAt === line) return l.startsWith("-") ? (removed === "null" ? null : Math.max(newAt - 1, 0)) : newAt
        oldAt++
        if (l.startsWith(" ")) newAt++
      }
      return removed === "null" ? null : newAt - 1
    }
    delta += h.newLines - h.oldLines
  }
  return line + delta
}

export type HunkWindow = { start: number; end: number; text: string; added: Set<number> }

// Each hunk's new side (context and added lines), with the new line numbers
// that were added. Parsing a window gives the parser context around the change.
export function hunkWindows(hunks: Hunk[]): HunkWindow[] {
  return hunks.flatMap((h) => {
    const kept = h.lines.filter((l) => !l.startsWith("-"))
    if (kept.length === 0) return []
    const added = new Set<number>()
    kept.forEach((l, i) => {
      if (l.startsWith("+")) added.add(h.newStart + i)
    })
    return [{ start: h.newStart, end: h.newStart + kept.length - 1, text: kept.map((l) => l.slice(1)).join("\n"), added }]
  })
}
