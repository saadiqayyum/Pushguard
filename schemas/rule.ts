import { z } from "zod";

export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const CHANGE_TYPES = ["added", "modified", "removed"] as const;

const REGEX_MAX_LENGTH = 500;
const GLOB_MAX_LENGTH = 256;

const glob = z.string().min(1).max(GLOB_MAX_LENGTH);

const safeRegex = z
  .string()
  .min(1)
  .max(REGEX_MAX_LENGTH)
  .superRefine((value, ctx) => {
    try {
      new RegExp(value);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid regular expression",
      });
    }
  });

const hour = z.number().int().min(0).max(23);

const hourRange = z
  .object({
    between: z.tuple([hour, hour]).optional(),
    not_between: z.tuple([hour, hour]).optional(),
  })
  .strict()
  .refine((v) => (v.between ? 1 : 0) + (v.not_between ? 1 : 0) === 1, {
    message: "Provide exactly one of between or not_between",
  });

export const whenSchema = z
  .object({
    forced: z.boolean().optional(),
    // True the first time an account pushes to a repository. Answered by the
    // webhook against stored history, not by the engine, which stays pure.
    sender_first_push: z.boolean().optional(),
    branch_created: z.boolean().optional(),
    branch_deleted: z.boolean().optional(),
    /**
     * A commit in this push claims an author that is not the account GitHub
     * authenticated. Git takes `user.name`/`user.email` from local config and
     * never verifies them, so a commit can name anyone; `sender.login` is who
     * actually held the credential. Legitimate on a rebase of someone else's
     * work, so this is a signal and not a verdict.
     */
    author_mismatch: z.boolean().optional(),
    /**
     * These commits reached the branch without a pull request.
     *
     * Answered by asking GitHub which pull requests contain the head commit, so
     * it costs one API call on a push to a branch a rule scoped this way. Scope
     * it with `branches`, or every feature-branch push in the org matches.
     */
    unreviewed: z.boolean().optional(),
    hour_utc: hourRange.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Empty when block" });

export const ruleSchema = z
  .object({
    id: z
      .string()
      .max(64)
      .regex(
        /^[a-z0-9]+(-[a-z0-9]+)*$/,
        "Use kebab-case: lowercase letters, digits, hyphens",
      ),
    description: z.string().max(500).optional(),
    /**
     * Which catalog pack a rule came from. Absent means somebody wrote it here.
     *
     * Grouping only. A pack does not decide where a rule applies: the rules in
     * an ecosystem pack are scoped by their own `paths`, so a C++ rule costs one
     * glob test on a JavaScript push and can never fire on it. Nobody has to
     * declare what language a repository is.
     */
    pack: z
      .string()
      .max(32)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use kebab-case")
      .optional(),
    severity: z.enum(SEVERITIES),
    enabled: z.boolean().default(true),
    repos: z.array(glob).min(1).max(50).optional(),
    branches: z.array(glob).min(1).max(50).optional(),
    paths: z.array(glob).min(1).max(100).optional(),
    all_of: z.array(z.array(glob).min(1).max(50)).min(2).max(5).optional(),
    exclude_paths: z.array(glob).min(1).max(100).optional(),
    change_type: z.array(z.enum(CHANGE_TYPES)).min(1).max(3).optional(),
    when: whenSchema.optional(),
    added_lines: safeRegex.optional(),
    /**
     * Regex against the commit messages in the push. Needs no diff, so unlike
     * `added_lines` it costs nothing and is answerable during a scan's window
     * only insofar as the messages are present.
     */
    commit_message: safeRegex.optional(),
    /**
     * Unicode characters that make source read differently than it runs.
     *
     * Not a regex, because this is not a regex problem. Bidi overrides,
     * invisible separators, variation selectors and homoglyphs are catalogued
     * by Unicode and change with each release; a hand-written character class
     * is both incomplete and wrong in the other direction, flagging every file
     * that legitimately contains Arabic or Hebrew text.
     *
     * - `controls` catches the Trojan Source family: bidi overrides and
     *   isolates, zero-width characters, soft hyphens, variation selectors.
     *   Letters are never flagged, so RTL prose in a string or comment is fine.
     * - `confusables` adds homoglyphs, a Cyrillic `а` in an otherwise Latin
     *   identifier. A separate attack and a noisier one, so it is opt-in.
     */
    unicode_risk: z.enum(["controls", "confusables"]).optional(),
    ai: z.string().min(10).max(1000).optional(),
  })
  .strict()
  .refine(
    (r) =>
      r.paths || r.all_of || r.when || r.added_lines || r.commit_message || r.unicode_risk || r.ai,
    {
      message:
        "Rule needs at least one condition: paths, all_of, when, added_lines, commit_message, unicode_risk, or ai",
    },
  )
  .refine((r) => !r.exclude_paths || r.paths || r.all_of, {
    message: "exclude_paths requires paths or all_of",
  });

export const rulesFileSchema = z.array(ruleSchema).superRefine((rules, ctx) => {
  const seen = new Set<string>();
  for (const rule of rules) {
    if (seen.has(rule.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate rule id: ${rule.id}`,
      });
    }
    seen.add(rule.id);
  }
});

export type Rule = z.infer<typeof ruleSchema>;
export type Severity = (typeof SEVERITIES)[number];
export type ChangeType = (typeof CHANGE_TYPES)[number];
