import picomatch from "picomatch"
import type { ChangeType, Rule } from "@/schemas/rule"

export type ChangedFile = { path: string; changeType: ChangeType }

export type PushContext = {
  repo: string
  branch: string
  forced: boolean
  branchCreated: boolean
  branchDeleted: boolean
  hourUtc: number
  files: ChangedFile[]
}

export type RuleMatch = {
  rule: Rule
  matchedFiles: string[]
  needsDiff: boolean
}

const MAX_SCANNED_LINE_LENGTH = 2000

export function evaluateRules(rules: Rule[], context: PushContext): RuleMatch[] {
  const matches: RuleMatch[] = []
  for (const rule of rules) {
    const match = evaluateRule(rule, context)
    if (match) matches.push(match)
  }
  return matches
}

export function evaluateRule(rule: Rule, context: PushContext): RuleMatch | null {
  if (rule.repos && !matchesAny(rule.repos, context.repo)) return null
  if (rule.branches && !matchesAny(rule.branches, context.branch)) return null
  if (rule.when && !matchesWhen(rule.when, context)) return null

  let matchedFiles: string[] = []
  if (rule.paths) {
    matchedFiles = matchFiles(rule, context.files)
    if (matchedFiles.length === 0) return null
  }

  const needsDiff = Boolean(rule.added_lines || rule.ai)
  return { rule, matchedFiles, needsDiff }
}

export function matchAddedLines(rule: Rule, addedLines: string[]): string[] {
  if (!rule.added_lines) return []
  const pattern = new RegExp(rule.added_lines)
  return addedLines.filter((line) => pattern.test(line.slice(0, MAX_SCANNED_LINE_LENGTH)))
}

export type ConfirmedMatch = RuleMatch & { matchedLines: string[] }

// Fail-open: a content rule with no diff available stays flagged rather than
// silently dropping a detection.
export function confirmContentMatches(matches: RuleMatch[], addedLines: string[] | null): ConfirmedMatch[] {
  const confirmed: ConfirmedMatch[] = []
  for (const match of matches) {
    if (!match.rule.added_lines || addedLines === null) {
      confirmed.push({ ...match, matchedLines: [] })
      continue
    }
    const matchedLines = matchAddedLines(match.rule, addedLines)
    if (matchedLines.length > 0) confirmed.push({ ...match, matchedLines })
  }
  return confirmed
}

function matchFiles(rule: Rule, files: ChangedFile[]): string[] {
  const include = picomatch(rule.paths ?? ["**"], { dot: true })
  const exclude = rule.exclude_paths ? picomatch(rule.exclude_paths, { dot: true }) : null
  const changeTypes = new Set(rule.change_type ?? ["added", "modified", "removed"])

  return files
    .filter((file) => changeTypes.has(file.changeType))
    .filter((file) => include(file.path) && !exclude?.(file.path))
    .map((file) => file.path)
}

function matchesAny(globs: string[], value: string): boolean {
  return picomatch(globs, { dot: true })(value)
}

function matchesWhen(when: NonNullable<Rule["when"]>, context: PushContext): boolean {
  if (when.forced !== undefined && when.forced !== context.forced) return false
  if (when.branch_created !== undefined && when.branch_created !== context.branchCreated) return false
  if (when.branch_deleted !== undefined && when.branch_deleted !== context.branchDeleted) return false
  if (when.hour_utc) {
    const inRange = hourInRange(context.hourUtc, when.hour_utc.between ?? when.hour_utc.not_between!)
    if (when.hour_utc.between && !inRange) return false
    if (when.hour_utc.not_between && inRange) return false
  }
  return true
}

function hourInRange(hour: number, [start, end]: [number, number]): boolean {
  if (start <= end) return hour >= start && hour <= end
  return hour >= start || hour <= end
}
