import { compact } from "@/lib/compact"
import type { CompareFile, DependencyChange } from "@/lib/github"

// What a review is shown before it reads anything.
// The diff is the map: it says what changed and where, which is the signal on a
// push. Whole files are read afterwards, through tools, only where it matters.
export const MAX_HUNK_CHARS = 60_000
export const MAX_LISTED_FILES = 200

export type DiffContext = { text: string; seeds: string[]; truncated: boolean }

const stat = (file: CompareFile) =>
  `${file.path} (${file.status}, +${file.additions}/-${file.deletions})`

// Renders the stats table, then as many hunks as the budget allows.
// Files whose hunks did not fit are still named in the table, so nothing is
// silently absent: the model can ask for any of them with read_file.
export function renderDiffContext(
  files: CompareFile[],
  dependencies: DependencyChange[] | null,
  budget = MAX_HUNK_CHARS,
): DiffContext {
  const listed = files.slice(0, MAX_LISTED_FILES)
  const lines: string[] = []

  lines.push(`This range changed ${files.length} file${files.length === 1 ? "" : "s"}:`)
  lines.push(...listed.map((file) => `- ${stat(file)}`))
  if (files.length > listed.length) {
    lines.push(`- ...and ${files.length - listed.length} more, not listed.`)
  }

  if (dependencies && dependencies.length > 0) {
    lines.push("", "Dependencies added by this range that carry known advisories:")
    for (const dep of dependencies) {
      for (const vuln of dep.vulnerabilities) {
        lines.push(
          `- ${dep.ecosystem}:${dep.name}@${dep.version} (${dep.manifest}) — ${vuln.severity}: ${vuln.summary} [${vuln.advisory}]`,
        )
      }
    }
  }

  let remaining = budget
  const shown: string[] = []
  const skipped: string[] = []
  // Compaction can cut a very long line before the budget ever sees it, so a
  // patch that fits is not proof the whole patch was shown.
  let cutLines = 0
  for (const file of listed) {
    if (!file.patch) continue
    const { text: patch, truncated } = compact(file.patch)
    cutLines += truncated
    if (patch.length > remaining) {
      skipped.push(file.path)
      continue
    }
    remaining -= patch.length
    shown.push(`--- ${file.path}\n${patch}`)
  }

  if (shown.length > 0) lines.push("", "Changed lines:", ...shown)
  if (cutLines > 0) {
    lines.push(
      "",
      `${cutLines} very long line(s) in this diff were cut. Read the file with read_file to see them whole.`,
    )
  }
  if (skipped.length > 0) {
    lines.push(
      "",
      `The diff for ${skipped.length} file${skipped.length === 1 ? "" : "s"} did not fit and is not shown. Read any of them with read_file: ${skipped.slice(0, 20).join(", ")}.`,
    )
  }

  return {
    text: lines.join("\n"),
    seeds: listed.map((file) => file.path),
    truncated: skipped.length > 0 || cutLines > 0 || files.length > listed.length,
  }
}
