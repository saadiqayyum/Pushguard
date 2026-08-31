// `acme/api` -> `acme`. Written out inline in eight places before this.
export function ownerOf(repo: string): string {
  return repo.split("/")[0]
}

import type { ScanFinding } from "@/lib/db"
import type { Rule, Severity } from "@/schemas/rule"

// The shape and the caps a finding is stored with, in one place.
// A matched line, made safe to put in an issue body.
const squeeze = (line: string) =>
  line
    .replace(/[\u200b-\u200f\u2060\ufeff\u00ad]/g, "")
    .replace(/[\u202a-\u202e\u2066-\u2069\u061c]/g, "")
    .replace(/\s+/g, " ")
    .trim()

export const MAX_FILES_PER_FINDING = 20
export const MAX_LINES_PER_FINDING = 5
export const MAX_LINE_LENGTH = 300

// A sentence, not a quoted line. Matches the cap the model is given.
export const MAX_PROSE_LENGTH = 600

// Evidence comes in two shapes and they are not interchangeable. A matched
// source line is quoted, capped and rendered as code. A model's verdict, or an
// explanation of why something was not read, is a sentence: capping it at a
// code line's length threw away half of every long one.
export function toFinding(
  rule: Pick<Rule, "id" | "severity" | "description">,
  repo: string,
  files: string[],
  lines: string[],
  options: { prose?: boolean } = {},
): ScanFinding {
  return {
    ruleId: rule.id,
    severity: rule.severity,
    ...(rule.description ? { description: rule.description } : {}),
    repo,
    files: files.slice(0, MAX_FILES_PER_FINDING),
    ...(options.prose ? { prose: true as const } : {}),
    lines: lines
      .slice(0, MAX_LINES_PER_FINDING)
      .map((line) => squeeze(line).slice(0, options.prose ? MAX_PROSE_LENGTH : MAX_LINE_LENGTH)),
  }
}

export const SEVERITY_ORDER: Severity[] = ["low", "medium", "high", "critical"]

// The loudest of several severities. Was implemented twice, differently.
export function topSeverity(severities: Severity[]): Severity {
  return severities.reduce(
    (top, next) => (SEVERITY_ORDER.indexOf(next) > SEVERITY_ORDER.indexOf(top) ? next : top),
    "low" as Severity,
  )
}

// Backticked and safe to drop into markdown.
const code = (value: string) => `\`${value.replaceAll("`", "")}\``

// The findings list, as markdown. Both issue bodies rendered this themselves, * the same bullet, the same backticked file list, the same escaping, and had.
export function findingsMarkdown(findings: ScanFinding[], redactContent = false): string[] {
  const lines: string[] = []
  for (const finding of findings) {
    lines.push(
      `- **${finding.ruleId}** (${finding.severity})${finding.description ? `: ${finding.description}` : ""}`,
    )
    if (finding.files.length > 0) {
      lines.push(`  - files: ${finding.files.map(code).join(", ")}`)
    }
    if (redactContent) {
      if (finding.lines.length > 0) {
        const count = finding.lines.length
        lines.push(
          `  - ${count} matching line${count === 1 ? "" : "s"} withheld: this issue is public. Read them in the Pushguard dashboard.`,
        )
      }
      continue
    }
    for (const line of finding.lines) {
      lines.push(`  - ${finding.prose ? line.trim() : code(line.trim())}`)
    }
  }
  return lines
}

export type ForcePushForensics = {
  erasedCommits: { sha: string; message: string; author: string | null }[]
  erasedCommitCount: number
  erasedFiles: string[]
  findings: ScanFinding[]
  mergeBase: string
  truncated: boolean
}

// The forensics section of an alert body.
export function erasureMarkdown(
  forensics: ForcePushForensics,
  repo: string,
  before: string,
): string[] {
  const { erasedCommitCount, erasedCommits } = forensics
  const lines = [
    "",
    "### Erased by this force push",
    "",
    `This push made ${erasedCommitCount} commit${erasedCommitCount === 1 ? "" : "s"} unreachable.`,
    "The content below was in the branch and is not in it any more, so it will not appear in a",
    "fresh clone or in any scanner that reads one. It was still published: it is in every clone",
    "taken before the rewrite. **Treat anything secret in it as leaked and rotate it.**",
    "",
  ]
  for (const commit of erasedCommits) {
    lines.push(`- \`${commit.sha.slice(0, 7)}\` ${commit.message}${commit.author ? ` — @${commit.author}` : ""}`)
  }
  if (erasedCommitCount > erasedCommits.length) {
    lines.push(`- ...and ${erasedCommitCount - erasedCommits.length} more`)
  }
  if (forensics.truncated) {
    lines.push("", "The erased diff exceeded the size cap and was truncated; more may be missing.")
  }
  lines.push(
    "",
    `Orphaned commits stay readable until GitHub collects them: [view the erased side](https://github.com/${repo}/compare/${forensics.mergeBase.slice(0, 7)}...${before.slice(0, 7)})`,
  )
  return lines
}

// Where to look on GitHub for a range of commits, or a single one.
export function compareLink(repo: string, base: string | null, head: string): string {
  return base
    ? `[Compare view](https://github.com/${repo}/compare/${base}...${head})`
    : `[View commit](https://github.com/${repo}/commit/${head})`
}
