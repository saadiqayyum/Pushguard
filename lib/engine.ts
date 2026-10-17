import { hasConfusables } from "anti-trojan-source";
import picomatch from "picomatch";
import type { FileLines } from "@/lib/diff-lines";
import { neutralizeEmoji } from "@/lib/unicode";
import { CHANGE_SOURCES, hasCondition, type ChangeType, type Rule } from "@/schemas/rule";

export type ChangedFile = { path: string; changeType: ChangeType };

export type ChangeSource = "push" | "pull_request";

// For a pull request, `branch` is the base: the branch the change is aimed at,
// which is what a rule's `branches` guards. The head is in `pullRequest`.
export type PushContext = {
  event?: ChangeSource;
  pullRequest?: { number: number; head: string; draft: boolean; opened: boolean };
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

// One flat rule per condition group, sharing the rule's id, severity and scope.
// A rule with no `any_of` is its own single variant.
export function ruleVariants(rule: Rule): Rule[] {
  if (!rule.any_of) return [rule];
  const { any_of, paths, all_of, exclude_paths, change_type, when, added_lines, commit_message, unicode_risk, ...shared } = rule;
  const top = { paths, all_of, exclude_paths, change_type, when, added_lines, commit_message, unicode_risk };
  const groups = hasCondition(top) ? [top, ...any_of] : any_of;
  return groups.map((group) => ({ ...shared, ...group }));
}

// A rule with advanced conditions needs push data the engine does not hold, so
// it is evaluated by lib/rules/advanced on pushes and skipped everywhere else.
const variantsOf = (rules: Rule[]) => rules.filter((rule) => !rule.advanced).flatMap(ruleVariants);

// Every matching variant: content confirmation may reject one and accept another.
export function evaluateRules(
  rules: Rule[],
  context: PushContext,
): RuleMatch[] {
  const matches: RuleMatch[] = [];
  for (const variant of variantsOf(rules)) {
    const match = evaluateVariant(variant, context);
    if (match) matches.push(match);
  }
  return matches;
}

export function evaluateRule(rule: Rule, context: PushContext): RuleMatch | null {
  return evaluateRules([rule], context)[0] ?? null;
}

export function patternsOf(value: string | string[] | undefined): RegExp[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).map((source) => new RegExp(source));
}

function evaluateVariant(
  rule: Rule,
  context: PushContext,
): RuleMatch | null {
  if (!runsOn(rule, context)) return null;
  if (rule.repos && !matchesAny(rule.repos, context.repo)) return null;
  if (rule.branches && !matchesAny(rule.branches, context.branch)) return null;
  if (rule.when && !matchesWhen(rule.when, context)) return null;

  let matchedMessages: string[] = [];
  if (rule.commit_message) {
    const patterns = patternsOf(rule.commit_message);
    matchedMessages = context.commitMessages.filter((message) => {
      const subject = normalizeForMatching(message.split("\n")[0]);
      return patterns.some((pattern) => pattern.test(subject));
    });
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

// A rule runs on pushes and pull requests unless `on` narrows it. A pull
// request from a fork never raises a push event here, so it must be the default.
export function runsOn(rule: Pick<Rule, "on">, context: Pick<PushContext, "event">): boolean {
  return (rule.on ?? CHANGE_SOURCES).includes(context.event ?? "push");
}

// A scan reads committed code, not a push event. Rules that ask about the push.
export function scannableRules(rules: Rule[]): Rule[] {
  return variantsOf(rules)
    .filter(
      (rule) =>
        !rule.when &&
        runsOn(rule, {}) &&
        (rule.paths ||
          rule.all_of ||
          rule.added_lines ||
          rule.commit_message ||
          rule.unicode_risk),
    );
}

// A force push is inspected for content that *vanished*, never for paths that
// changed: a rewrite touches every path it moves, so path rules would all fire.
export function erasureRules(rules: Rule[]): Rule[] {
  return variantsOf(rules)
    .filter(
      (rule) =>
        (rule.added_lines || rule.unicode_risk) &&
        !rule.when &&
        runsOn(rule, {}) &&
        !rule.commit_message,
    );
}

// Added lines that were reachable from the old tip and are not reachable from
// the new one. A line that survives in any file counts as kept: rewrites move code.
export function erasedLines(orphaned: FileLines, surviving: FileLines): FileLines {
  const kept = new Set([...surviving.values()].flat().map((line) => line.trim()));
  const erased: FileLines = new Map();
  for (const [path, lines] of orphaned) {
    const seen = new Set<string>();
    const gone = lines.filter((line) => {
      const key = line.trim();
      if (key === "" || kept.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (gone.length > 0) erased.set(path, gone);
  }
  return erased;
}

// Does any rule actually ask whether this push bypassed review?
export function needsReviewCheck(
  rules: Rule[],
  repo: string,
  branch: string,
): boolean {
  return rules.flatMap(ruleVariants).some(
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
  const patterns = patternsOf(rule.added_lines);
  return raw.filter((line, i) =>
    patterns.some((pattern) => pattern.test(line) || pattern.test(normalized[i])),
  );
}

// Added lines carrying Unicode that makes them read differently than they run.
export function matchUnicodeRisk(rule: Rule, addedLines: string[]): string[] {
  if (!rule.unicode_risk) return [];
  const extended = rule.unicode_risk === "confusables";
  const sourceText = neutralizeEmoji(addedLines.join("\n"), extended);

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

function contentHits(rule: Rule, lines: ScannedLines): string[] {
  const hits = rule.added_lines ? matchAddedLines(rule, lines) : lines.raw;
  return rule.unicode_risk && hits.length > 0 ? matchUnicodeRisk(rule, hits) : hits;
}

// Fail-open: a content rule with no diff available stays flagged rather than
// silently dropping a detection. A path-scoped variant reads only its own files.
export function confirmContentMatches(
  matches: RuleMatch[],
  addedLines: FileLines | null,
): ConfirmedMatch[] {
  const confirmed: ConfirmedMatch[] = [];
  const done = new Set<string>();

  const prepared =
    addedLines === null
      ? null
      : [...addedLines].map(([path, lines]) => [path, prepareLines(lines)] as const);

  for (const match of matches) {
    const { rule } = match;
    if (done.has(rule.id)) continue;
    if ((!rule.added_lines && !rule.unicode_risk) || prepared === null) {
      confirmed.push({ ...match, matchedLines: [] });
      done.add(rule.id);
      continue;
    }

    const scope = rule.paths || rule.all_of ? new Set(match.matchedFiles) : null;
    const matchedFiles: string[] = [];
    const matchedLines: string[] = [];
    for (const [path, lines] of prepared) {
      if (scope && !scope.has(path)) continue;
      const hits = contentHits(rule, lines);
      if (hits.length === 0) continue;
      matchedFiles.push(path);
      matchedLines.push(...hits);
    }
    if (matchedLines.length > 0) {
      confirmed.push({ ...match, matchedFiles, matchedLines });
      done.add(rule.id);
    }
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
  if (when.pr_draft !== undefined) {
    if (!context.pullRequest || when.pr_draft !== context.pullRequest.draft) return false;
  }
  if (when.pr_opened !== undefined) {
    if (!context.pullRequest || when.pr_opened !== context.pullRequest.opened) return false;
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
