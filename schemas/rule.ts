import { z } from "zod";
import { advancedSchema, MAX_RESPONSES, responseSchema } from "./rule-advanced";
import { CHANGE_SOURCES, CHANGE_TYPES, DESCRIPTION_MAX, glob, kebab, safeRegex, SEVERITIES, whenSchema } from "./rule-fields";

export * from "./rule-fields";

const MAX_PATTERNS = 20;
export const MAX_GROUPS = 10;
export const MAX_FILE_SETS = 5;

// One pattern, or several that each match on their own (OR).
const patternList = z.union([safeRegex, z.array(safeRegex).min(1).max(MAX_PATTERNS)]);

// The conditions one group ANDs together. A rule is one group (these fields at
// the top level) or several under `any_of`, any of which may match.
const conditionFields = {
  paths: z.array(glob).min(1).max(100).optional(),
  all_of: z.array(z.array(glob).min(1).max(50)).min(2).max(MAX_FILE_SETS).optional(),
  exclude_paths: z.array(glob).min(1).max(100).optional(),
  change_type: z.array(z.enum(CHANGE_TYPES)).min(1).max(3).optional(),
  when: whenSchema.optional(),
  added_lines: patternList.optional(),
  commit_message: patternList.optional(),
  unicode_risk: z.enum(["controls", "confusables"]).optional(),
};

type Conditions = { [K in keyof typeof conditionFields]?: z.infer<(typeof conditionFields)[K]> };

export function hasCondition(c: Conditions): boolean {
  return Boolean(c.paths || c.all_of || c.when || c.added_lines || c.commit_message || c.unicode_risk);
}

const excludeNeedsPaths = (c: Conditions) => !c.exclude_paths || Boolean(c.paths || c.all_of);

export const conditionGroupSchema = z
  .object(conditionFields)
  .strict()
  .refine(hasCondition, { message: "A group needs at least one condition" })
  .refine(excludeNeedsPaths, { message: "exclude_paths requires paths or all_of" });

// `advanced` ANDs with the pattern conditions; `responses` run when the rule fires.
export const ruleFields = {
  id: kebab,
  description: z.string().max(DESCRIPTION_MAX).optional(),
  pack: kebab.max(32).optional(),
  severity: z.enum(SEVERITIES),
  enabled: z.boolean().default(true),
  on: z.array(z.enum(CHANGE_SOURCES)).min(1).max(2).optional(),
  repos: z.array(glob).min(1).max(50).optional(),
  branches: z.array(glob).min(1).max(50).optional(),
  ...conditionFields,
  any_of: z.array(conditionGroupSchema).min(1).max(MAX_GROUPS).optional(),
  advanced: advancedSchema.optional(),
  responses: z.array(responseSchema).min(1).max(MAX_RESPONSES).optional(),
};

type RuleShape = Conditions & { any_of?: unknown; advanced?: unknown };

export function ruleChecks(r: RuleShape, ctx: z.RefinementCtx): void {
  if (!hasCondition(r) && !r.any_of && !r.advanced) {
    ctx.addIssue({
      code: "custom",
      message: "Rule needs at least one condition: paths, all_of, when, added_lines, commit_message, unicode_risk, any_of, or advanced",
    });
  }
  if (!excludeNeedsPaths(r)) ctx.addIssue({ code: "custom", message: "exclude_paths requires paths or all_of" });
}

export const ruleSchema = z.object(ruleFields).strict().superRefine(ruleChecks);

export type ConditionGroup = z.infer<typeof conditionGroupSchema>;

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
