import { z } from "zod";

export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const CHANGE_TYPES = ["added", "modified", "removed"] as const;

// Events a rule runs on. Absent means both.
export const CHANGE_SOURCES = ["push", "pull_request"] as const;

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
    sender_first_push: z.boolean().optional(),
    branch_created: z.boolean().optional(),
    branch_deleted: z.boolean().optional(),
    author_mismatch: z.boolean().optional(),
    unreviewed: z.boolean().optional(),
    pr_draft: z.boolean().optional(),
    pr_opened: z.boolean().optional(),
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
    pack: z
      .string()
      .max(32)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use kebab-case")
      .optional(),
    severity: z.enum(SEVERITIES),
    enabled: z.boolean().default(true),
    on: z.array(z.enum(CHANGE_SOURCES)).min(1).max(2).optional(),
    repos: z.array(glob).min(1).max(50).optional(),
    branches: z.array(glob).min(1).max(50).optional(),
    paths: z.array(glob).min(1).max(100).optional(),
    all_of: z.array(z.array(glob).min(1).max(50)).min(2).max(5).optional(),
    exclude_paths: z.array(glob).min(1).max(100).optional(),
    change_type: z.array(z.enum(CHANGE_TYPES)).min(1).max(3).optional(),
    when: whenSchema.optional(),
    added_lines: safeRegex.optional(),
    commit_message: safeRegex.optional(),
    unicode_risk: z.enum(["controls", "confusables"]).optional(),
  })
  .strict()
  .refine(
    (r) =>
      r.paths || r.all_of || r.when || r.added_lines || r.commit_message || r.unicode_risk,
    {
      message:
        "Rule needs at least one condition: paths, all_of, when, added_lines, commit_message, or unicode_risk",
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
