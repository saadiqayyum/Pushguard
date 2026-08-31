import { hasConfusables } from "anti-trojan-source";
import picomatch from "picomatch";
import type { ChangeType, Rule } from "@/schemas/rule";

export type ChangedFile = { path: string; changeType: ChangeType };

export type PushContext = {
  repo: string;
  branch: string;
  forced: boolean;
  senderFirstPush: boolean;
  branchCreated: boolean;
  branchDeleted: boolean;
  authorMismatch: boolean;
  unreviewed: boolean | null;
  hourUtc: number;
  files: ChangedFile[];
  commitMessages: string[];
};

export type RuleMatch = {
  rule: Rule;
  matchedFiles: string[];
  matchedMessages: string[];
  needsDiff: boolean;
};

export const INVISIBLE = /[\u200b-\u200f\u2060\ufeff\u00ad]/g;
// Bidi overrides, embeddings and isolates: the Trojan Source family.
export const BIDI_CONTROL = /[\u202a-\u202e\u2066-\u2069\u061c]/g;

export function normalizeForMatching(line: string): string {
  return line
    .replace(INVISIBLE, "")
    .replace(BIDI_CONTROL, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function evaluateRules(
  rules: Rule[],
  context: PushContext,
): RuleMatch[] {
  const matches: RuleMatch[] = [];
  for (const rule of rules) {
    const match = evaluateRule(rule, context);
    if (match) matches.push(match);
  }
  return matches;
}

export function evaluateRule(
  rule: Rule,
  context: PushContext,
): RuleMatch | null {
  if (rule.repos && !matchesAny(rule.repos, context.repo)) return null;
  if (rule.branches && !matchesAny(rule.branches, context.branch)) return null;
  if (rule.when && !matchesWhen(rule.when, context)) return null;

  let matchedMessages: string[] = [];
  if (rule.commit_message) {
    const pattern = new RegExp(rule.commit_message);
    matchedMessages = context.commitMessages.filter((message) =>
      pattern.test(normalizeForMatching(message.split("\n")[0])),
    );
    if (matchedMessages.length === 0) return null;
  }

  let matchedFiles: string[] = [];
  if (rule.paths || rule.all_of) {
    const eligible = eligibleFiles(rule, context.files);

    if (rule.paths) {
      matchedFiles = matching(eligible, rule.paths);
      if (matchedFiles.length === 0) return null;
    }

    if (rule.all_of) {
      const groups = rule.all_of.map((globs) => matching(eligible, globs));
      if (groups.some((group) => group.length === 0)) return null;
      matchedFiles = [...new Set([...matchedFiles, ...groups.flat()])];
    }
  }

  const needsDiff = Boolean(rule.added_lines || rule.unicode_risk);
  return { rule, matchedFiles, matchedMessages, needsDiff };
}

// A scan reads committed code, not a push event. Rules that ask about the push.
export function scannableRules(rules: Rule[]): Rule[] {
  return rules
    .filter(
      (rule) =>
        !rule.when &&
        (rule.paths ||
          rule.all_of ||
          rule.added_lines ||
          rule.commit_message ||
          rule.unicode_risk),
    );
}

// A force push is inspected for content that *vanished*, never for paths that.
export function erasureRules(rules: Rule[]): Rule[] {
  return rules
    .filter(
      (rule) =>
        (rule.added_lines || rule.unicode_risk) &&
        !rule.when &&
        !rule.commit_message,
    );
}

// Added lines that were reachable from the old tip and are not reachable from
// the new one.
export function erasedLines(orphaned: string[], surviving: string[]): string[] {
  const kept = new Set(surviving.map((line) => line.trim()));
  const seen = new Set<string>();
  return orphaned.filter((line) => {
    const key = line.trim();
    if (key === "" || kept.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Does any rule actually ask whether this push bypassed review?
export function needsReviewCheck(
  rules: Rule[],
  repo: string,
  branch: string,
): boolean {
  return rules.some(
    (rule) =>
      rule.when?.unreviewed !== undefined &&
      (!rule.repos || matchesAny(rule.repos, repo)) &&
      (!rule.branches || matchesAny(rule.branches, branch)),
  );
}

// Added lines in both the forms rules are tested against.
export type ScannedLines = { raw: string[]; normalized: string[] };

export function prepareLines(addedLines: string[]): ScannedLines {
  return { raw: addedLines, normalized: addedLines.map(normalizeForMatching) };
}

export function matchAddedLines(
  rule: Rule,
  lines: string[] | ScannedLines,
): string[] {
  if (!rule.added_lines) return [];
  const { raw, normalized } = Array.isArray(lines) ? prepareLines(lines) : lines;
  const pattern = new RegExp(rule.added_lines);
  return raw.filter(
    (line, i) => pattern.test(line) || pattern.test(normalized[i]),
  );
}

// Added lines carrying Unicode that makes them read differently than they run.
export function matchUnicodeRisk(rule: Rule, addedLines: string[]): string[] {
  if (!rule.unicode_risk) return [];
  const sourceText = addedLines.join("\n");
  const extended = rule.unicode_risk === "confusables";

  if (!hasConfusables({ sourceText, extended })) return [];

  const findings = hasConfusables({ sourceText, detailed: true, extended });

  const seen = new Set<string>();
  const reported: string[] = [];
  for (const finding of findings) {
    const key = `${finding.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    reported.push(
      `${finding.codePoint} ${finding.name} (${finding.category}) at column ${finding.column}`,
    );
  }
  return reported;
}

export type ConfirmedMatch = RuleMatch & { matchedLines: string[] };

// Fail-open: a content rule with no diff available stays flagged rather than
// silently dropping a detection.
export function confirmContentMatches(
  matches: RuleMatch[],
  addedLines: string[] | null,
): ConfirmedMatch[] {
  const confirmed: ConfirmedMatch[] = [];

  const prepared = addedLines === null ? null : prepareLines(addedLines);

  for (const match of matches) {
    const { rule } = match;
    if ((!rule.added_lines && !rule.unicode_risk) || prepared === null) {
      confirmed.push({ ...match, matchedLines: [] });
      continue;
    }

    let lines = prepared.raw;
    if (rule.added_lines) {
      lines = matchAddedLines(rule, prepared);
      if (lines.length === 0) continue;
    }
    const matchedLines = rule.unicode_risk
      ? matchUnicodeRisk(rule, lines)
      : lines;
    if (matchedLines.length > 0) confirmed.push({ ...match, matchedLines });
  }
  return confirmed;
}

// The files a rule is allowed to consider at all, before any glob is applied.
// Split out so `paths` and each `all_of` group test the same set.
function eligibleFiles(rule: Rule, files: ChangedFile[]): ChangedFile[] {
  const exclude = rule.exclude_paths
    ? picomatch(rule.exclude_paths, { dot: true })
    : null;
  const changeTypes = new Set(
    rule.change_type ?? ["added", "modified", "removed"],
  );
  return files.filter(
    (file) => changeTypes.has(file.changeType) && !exclude?.(file.path),
  );
}

function matching(files: ChangedFile[], globs: string[]): string[] {
  const include = picomatch(globs, { dot: true });
  return files.filter((file) => include(file.path)).map((file) => file.path);
}

function matchesAny(globs: string[], value: string): boolean {
  return picomatch(globs, { dot: true })(value);
}

export function matchesWhen(
  when: NonNullable<Rule["when"]>,
  context: PushContext,
): boolean {
  if (when.forced !== undefined && when.forced !== context.forced) return false;
  if (
    when.sender_first_push !== undefined &&
    when.sender_first_push !== context.senderFirstPush
  ) {
    return false;
  }
  if (
    when.branch_created !== undefined &&
    when.branch_created !== context.branchCreated
  )
    return false;
  if (
    when.branch_deleted !== undefined &&
    when.branch_deleted !== context.branchDeleted
  )
    return false;
  if (
    when.author_mismatch !== undefined &&
    when.author_mismatch !== context.authorMismatch
  )
    return false;
  if (when.unreviewed !== undefined) {
    if (context.unreviewed === null) return false;
    if (when.unreviewed !== context.unreviewed) return false;
  }
  if (when.hour_utc) {
    const inRange = hourInRange(
      context.hourUtc,
      when.hour_utc.between ?? when.hour_utc.not_between!,
    );
    if (when.hour_utc.between && !inRange) return false;
    if (when.hour_utc.not_between && inRange) return false;
  }
  return true;
}

function hourInRange(hour: number, [start, end]: [number, number]): boolean {
  if (start <= end) return hour >= start && hour <= end;
  return hour >= start || hour <= end;
}
