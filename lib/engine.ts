import { hasConfusables } from "anti-trojan-source"
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
  /** A commit here names an author that is not the account GitHub authenticated. */
  authorMismatch: boolean
  /**
   * These commits reached the branch outside a pull request. Null when nobody
   * asked: resolving it costs a GitHub call, so it is only looked up when a
   * rule actually tests it, and a rule testing it never matches on null.
   */
  unreviewed: boolean | null
  hourUtc: number
  files: ChangedFile[]
  commitMessages: string[]
}

export type RuleMatch = {
  rule: Rule
  matchedFiles: string[]
  /** Commit messages that matched `commit_message`. Evidence, so it is reported. */
  matchedMessages: string[]
  needsDiff: boolean
}

const MAX_SCANNED_LINE_LENGTH = 2000

/**
 * Collapse invisible padding so a line is matched on what it says, not on how
 * far it was pushed to the right.
 *
 * The cap above exists to bound regex work, and on raw text it is a bypass: pad
 * a line with 2001 spaces and the payload sits past the slice, so
 * `obfuscated-payload` never sees its own `eval(`. The same padding hides the
 * code from a human reviewer, who sees an empty-looking diff line and has to
 * scroll sideways to find anything. It is one edit that defeats the rule and
 * the reviewer at once.
 *
 * Zero-width and bidi control characters go too. They are the same trick
 * without the horizontal scroll, and they sit *inside* a token where whitespace
 * would be noticed: `eval` + U+202E + `(` defeats a rule looking for `eval\\(`
 * while still executing as `eval(`.
 *
 * Detection of those characters is not lost by stripping them here, because
 * every content rule is tested against the raw line as well.
 */
export const INVISIBLE = /[\u200b-\u200f\u2060\ufeff\u00ad]/g
/** Bidi overrides, embeddings and isolates: the Trojan Source family. */
export const BIDI_CONTROL = /[\u202a-\u202e\u2066-\u2069\u061c]/g

export function normalizeForMatching(line: string): string {
  return line.replace(INVISIBLE, "").replace(BIDI_CONTROL, "").replace(/\s+/g, " ").trim()
}

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

  let matchedMessages: string[] = []
  if (rule.commit_message) {
    const pattern = new RegExp(rule.commit_message)
    // Only the first line. A commit body can be arbitrarily long and a rule
    // about what a commit *claims to be* is a rule about its subject.
    matchedMessages = context.commitMessages.filter((message) =>
      pattern.test(normalizeForMatching(message.split("\n")[0]).slice(0, MAX_SCANNED_LINE_LENGTH)),
    )
    if (matchedMessages.length === 0) return null
  }

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

  const needsDiff = Boolean(rule.added_lines || rule.unicode_risk || rule.ai)
  return { rule, matchedFiles, matchedMessages, needsDiff }
}

// A scan reads committed code, not a push event. Rules that ask about the push
// itself (`when`: forced, branch created, time of day) have nothing to answer
// against, and the AI stage is a paid read of the diff that scanning skips. So
// an AI-only rule is dropped and an AI-plus-paths rule keeps its file test.
export function scannableRules(rules: Rule[]): Rule[] {
  return rules
    .filter(
      (rule) =>
        !rule.when &&
        (rule.paths || rule.all_of || rule.added_lines || rule.commit_message || rule.unicode_risk),
    )
    .map((rule) => (rule.ai ? { ...rule, ai: undefined } : rule))
}

// A force push is inspected for content that *vanished*, never for paths that
// were touched. A rebase rewrites every path on the branch, so a path rule
// would fire on every rebase in the org. Only `added_lines` can say a thing was
// removed from history rather than merely re-authored. `when` rules are dropped
// for the same reason a scan drops them: the orphaned side is a diff, not a
// push event, and has nothing to answer them with. `ai` is dropped because the
// surviving side already paid for that read.
export function erasureRules(rules: Rule[]): Rule[] {
  return rules
    .filter((rule) => (rule.added_lines || rule.unicode_risk) && !rule.when && !rule.commit_message)
    .map((rule) => (rule.ai ? { ...rule, ai: undefined } : rule))
}

/**
 * Added lines that were reachable from the old tip and are not reachable from
 * the new one.
 *
 * This set difference is the whole feature. Without it every force push reports
 * its own surviving content straight back: a rebase or an amend leaves the same
 * lines on both sides, so matching the orphaned diff on its own would flag code
 * that is still sitting in the branch. Comparing the two sides is what makes a
 * finding mean "this was taken out of history" instead of "this branch was
 * rewritten", which is a thing developers do all day.
 *
 * Compared on trimmed text: re-indentation during a rebase is not an erasure.
 * Blank lines are dropped so they cannot match a rule on their own.
 */
export function erasedLines(orphaned: string[], surviving: string[]): string[] {
  const kept = new Set(surviving.map((line) => line.trim()))
  const seen = new Set<string>()
  return orphaned.filter((line) => {
    const key = line.trim()
    if (key === "" || kept.has(key) || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Does any rule actually ask whether this push bypassed review?
 *
 * Answering `unreviewed` costs a GitHub call on the webhook path, so it is only
 * paid for when a rule wants it *and* that rule's own repo and branch scoping
 * already admits this push. Without the scoping check, one rule aimed at `main`
 * would put an API call on every feature-branch push in the organisation.
 */
export function needsReviewCheck(rules: Rule[], repo: string, branch: string): boolean {
  return rules.some(
    (rule) =>
      rule.when?.unreviewed !== undefined &&
      (!rule.repos || matchesAny(rule.repos, repo)) &&
      (!rule.branches || matchesAny(rule.branches, branch)),
  )
}

export function matchAddedLines(rule: Rule, addedLines: string[]): string[] {
  if (!rule.added_lines) return []
  const pattern = new RegExp(rule.added_lines)
  // Both forms, because normalising alone would break a rule that deliberately
  // tests indentation, and the raw form alone is the padding bypass. The union
  // can only ever match more, never less.
  return addedLines.filter(
    (line) =>
      pattern.test(line.slice(0, MAX_SCANNED_LINE_LENGTH)) ||
      pattern.test(normalizeForMatching(line).slice(0, MAX_SCANNED_LINE_LENGTH)),
  )
}

/**
 * Added lines carrying Unicode that makes them read differently than they run.
 *
 * The reported line names the character rather than quoting it. Quoting is
 * useless here by definition: the whole attack is that the character is
 * invisible or reorders what follows, so pasting it into an issue reproduces
 * the illusion instead of exposing it. `U+202E RIGHT-TO-LEFT OVERRIDE at
 * column 28` is the finding; the source is one click away.
 */
export function matchUnicodeRisk(rule: Rule, addedLines: string[]): string[] {
  if (!rule.unicode_risk) return []
  const findings = hasConfusables({
    sourceText: addedLines.join("\n"),
    detailed: true,
    extended: rule.unicode_risk === "confusables",
  })

  const seen = new Set<string>()
  const reported: string[] = []
  for (const finding of findings) {
    // One line can carry a dozen of these. The first from each line is enough
    // to send a reader to the right place.
    const key = `${finding.line}`
    if (seen.has(key)) continue
    seen.add(key)
    reported.push(
      `${finding.codePoint} ${finding.name} (${finding.category}) at column ${finding.column}`,
    )
  }
  return reported
}

export type ConfirmedMatch = RuleMatch & { matchedLines: string[] }

// Fail-open: a content rule with no diff available stays flagged rather than
// silently dropping a detection.
export function confirmContentMatches(matches: RuleMatch[], addedLines: string[] | null): ConfirmedMatch[] {
  const confirmed: ConfirmedMatch[] = []
  for (const match of matches) {
    const { rule } = match
    if ((!rule.added_lines && !rule.unicode_risk) || addedLines === null) {
      confirmed.push({ ...match, matchedLines: [] })
      continue
    }

    // A rule carrying both conditions is chained, not unioned: the same line
    // has to satisfy each. "Obfuscated *and* hiding behind a bidi override" is
    // a stronger claim than either alone, and it is the one worth a ticket.
    let lines = addedLines
    if (rule.added_lines) {
      lines = matchAddedLines(rule, lines)
      if (lines.length === 0) continue
    }
    const matchedLines = rule.unicode_risk ? matchUnicodeRisk(rule, lines) : lines
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
  if (when.author_mismatch !== undefined && when.author_mismatch !== context.authorMismatch) return false
  // Never resolved means never asked. Matching on an unknown would flag every
  // push in the org the first time somebody wrote this condition.
  if (when.unreviewed !== undefined) {
    if (context.unreviewed === null) return false
    if (when.unreviewed !== context.unreviewed) return false
  }
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
