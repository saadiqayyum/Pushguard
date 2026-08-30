/** `acme/api` -> `acme`. Written out inline in eight places before this. */
export function ownerOf(repo: string): string {
  return repo.split("/")[0]
}

import type { ScanFinding } from "@/lib/db"
import type { Rule, Severity } from "@/schemas/rule"

/**
 * The shape and the caps a finding is stored with, in one place.
 *
 * The push path and the scan path both build these, and they had drifted into
 * two copies of the same object literal with the same three magic numbers
 * written out twice.
 */
export const MAX_FILES_PER_FINDING = 20
export const MAX_LINES_PER_FINDING = 5
export const MAX_LINE_LENGTH = 300

export function toFinding(
  rule: Pick<Rule, "id" | "severity" | "description">,
  repo: string,
  files: string[],
  lines: string[],
): ScanFinding {
  return {
    ruleId: rule.id,
    severity: rule.severity,
    ...(rule.description ? { description: rule.description } : {}),
    repo,
    files: files.slice(0, MAX_FILES_PER_FINDING),
    lines: lines.slice(0, MAX_LINES_PER_FINDING).map((line) => line.slice(0, MAX_LINE_LENGTH)),
  }
}

export const SEVERITY_ORDER: Severity[] = ["low", "medium", "high", "critical"]

/** The loudest of several severities. Was implemented twice, differently. */
export function topSeverity(severities: Severity[]): Severity {
  return severities.reduce(
    (top, next) => (SEVERITY_ORDER.indexOf(next) > SEVERITY_ORDER.indexOf(top) ? next : top),
    "low" as Severity,
  )
}

/** Backticked and safe to drop into markdown. */
const code = (value: string) => `\`${value.replaceAll("`", "")}\``

/**
 * The findings list, as markdown. Both issue bodies rendered this themselves, * the same bullet, the same backticked file list, the same escaping, and had
 * already drifted: one capped files at twenty inline, the other trusted the
 * stored cap, and only one showed the matching lines.
 */
export function findingsMarkdown(findings: ScanFinding[]): string[] {
  const lines: string[] = []
  for (const finding of findings) {
    lines.push(
      `- **${finding.ruleId}** (${finding.severity})${finding.description ? `: ${finding.description}` : ""}`,
    )
    if (finding.files.length > 0) {
      lines.push(`  - files: ${finding.files.map(code).join(", ")}`)
    }
    for (const line of finding.lines) {
      lines.push(`  - ${code(line.trim())}`)
    }
  }
  return lines
}

/** Where to look on GitHub for a range of commits, or a single one. */
export function compareLink(repo: string, base: string | null, head: string): string {
  return base
    ? `[Compare view](https://github.com/${repo}/compare/${base}...${head})`
    : `[View commit](https://github.com/${repo}/commit/${head})`
}
