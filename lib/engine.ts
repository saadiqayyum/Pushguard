import picomatch from "picomatch"
import type { ChangeType, Rule } from "@/schemas/rule"

export type ChangedFile = { path: string; changeType: ChangeType }

export type PushContext = {
  repo: string
  branch: string
  forced: boolean
  /** First time this account has pushed to this repository. */
  senderFirstPush: boolean
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
  if (rule.paths || rule.all_of) {
    const eligible = eligibleFiles(rule, context.files)

    if (rule.paths) {
      matchedFiles = matching(eligible, rule.paths)
      if (matchedFiles.length === 0) return null
    }

    if (rule.all_of) {
      // Every group must be hit by at least one file in the same push. One
      // empty group and the whole rule is silent.
      const groups = rule.all_of.map((globs) => matching(eligible, globs))
      if (groups.some((group) => group.length === 0)) return null
      matchedFiles = [...new Set([...matchedFiles, ...groups.flat()])]
    }
  }

  const needsDiff = Boolean(rule.added_lines || rule.ai)
  return { rule, matchedFiles, needsDiff }
}

// A scan reads committed code, not a push event. Rules that ask about the push
// itself (`when`: forced, branch created, time of day) have nothing to answer
// against, and the AI stage is a paid read of the diff that scanning skips. So
// an AI-only rule is dropped and an AI-plus-paths rule keeps its file test.
export function scannableRules(rules: Rule[]): Rule[] {
  return rules
    .filter((rule) => !rule.when && (rule.paths || rule.all_of || rule.added_lines))
    .map((rule) => (rule.ai ? { ...rule, ai: undefined } : rule))
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

// The files a rule is allowed to consider at all, before any glob is applied.
// Split out so `paths` and each `all_of` group test the same set.
function eligibleFiles(rule: Rule, files: ChangedFile[]): ChangedFile[] {
  const exclude = rule.exclude_paths ? picomatch(rule.exclude_paths, { dot: true }) : null
  const changeTypes = new Set(rule.change_type ?? ["added", "modified", "removed"])
  return files.filter((file) => changeTypes.has(file.changeType) && !exclude?.(file.path))
}

function matching(files: ChangedFile[], globs: string[]): string[] {
  const include = picomatch(globs, { dot: true })
  return files.filter((file) => include(file.path)).map((file) => file.path)
}

function matchesAny(globs: string[], value: string): boolean {
  return picomatch(globs, { dot: true })(value)
}

function matchesWhen(when: NonNullable<Rule["when"]>, context: PushContext): boolean {
  if (when.forced !== undefined && when.forced !== context.forced) return false
  if (when.sender_first_push !== undefined && when.sender_first_push !== context.senderFirstPush) {
    return false
  }
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
