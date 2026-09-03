import { z } from "zod"
import { CHANGE_SOURCES, SEVERITIES, whenSchema } from "@/schemas/rule"

// A rule answered by a model instead of a pattern.

export const MAX_AI_RULES_PER_ACCOUNT = 50
export const MAX_AI_REVIEWS_PER_DAY = 200

// `changed` reads the files this push touched. `repository` navigates the whole
// tree through tools, and always runs as a background session.
export const AI_SCOPES = ["changed", "repository"] as const
export type AiScope = (typeof AI_SCOPES)[number]

const glob = z.string().min(1).max(256)

export const aiRuleSchema = z
  .object({
    id: z
      .string()
      .max(64)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use kebab-case: lowercase letters, digits, hyphens"),
    description: z.string().max(500).optional(),
    severity: z.enum(SEVERITIES),
    enabled: z.boolean().default(true),
    prompt: z.string().min(10).max(2000),
    scope: z.enum(AI_SCOPES).default("changed"),
    // Gates whether the question is worth asking, exactly as `paths` does.
    // A scan has no push event, so a rule using this is push-only.
    when: whenSchema.optional(),
    // Tool calls one repository-scope run may make. Ignored for `changed`.
    budget: z.number().int().min(5).max(120).default(40),
    on: z.array(z.enum(CHANGE_SOURCES)).min(1).max(2).optional(),
    repos: z.array(glob).min(1).max(50).optional(),
    branches: z.array(glob).min(1).max(50).optional(),
    base_branches: z.array(glob).min(1).max(50).optional(),
    paths: z.array(glob).min(1).max(100).optional(),
    exclude_paths: z.array(glob).min(1).max(100).optional(),
    key: z.string().uuid().optional(),
  })
  .strict()

export type AiRule = z.infer<typeof aiRuleSchema>

export const aiRulesFileSchema = z.array(aiRuleSchema).superRefine((rules, ctx) => {
  const seen = new Set<string>()
  for (const rule of rules) {
    if (seen.has(rule.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate rule id: ${rule.id}` })
    }
    seen.add(rule.id)
  }
})
