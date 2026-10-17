import { z } from "zod"
import { FACT_KINDS } from "@/lib/code-intel/types"
import { FOCUS_IDS } from "@/lib/rules/focus"
import { OPERATORS, toRegex } from "@/lib/rules/operators"
import { CHANGE_TYPES, glob, kebab, REGEX_MAX_LENGTH, whenSchema } from "./rule-fields"
import { INDICATOR_KINDS } from "./threat-intel"

export const MAX_CONDITION_DEPTH = 4
export const MAX_CONDITION_LEAVES = 30
export const MAX_RESPONSES = 8
export const MAX_WITHIN_COMMITS = 50
export const MAX_WITHIN_DAYS = 365
export const MAX_INVESTIGATE_TOKENS = 32_000
const MAX_CHILDREN = 10
const MAX_GLOBS = 50
const MAX_VALUES = 20

export const DETONATE_PHASES = ["install", "import", "execute", "check"] as const

const globs = z.array(glob).min(1).max(MAX_GLOBS)
const kinds = z.array(z.enum(FACT_KINDS)).min(1).max(FACT_KINDS.length)

const linesLeaf = z
  .object({
    op: z.enum(OPERATORS),
    values: z.array(z.string().min(1).max(REGEX_MAX_LENGTH)).min(1).max(MAX_VALUES),
    files: globs.optional(),
  })
  .strict()
  .superRefine((leaf, ctx) => {
    for (const [i, value] of leaf.values.entries()) {
      try {
        new RegExp(toRegex({ op: leaf.op, value }))
      } catch {
        ctx.addIssue({ code: "custom", path: ["values", i], message: "Invalid regular expression" })
      }
    }
  })

export const leafSchema = z.union([
  z.object({ files: z.object({ paths: globs, exclude: globs.optional(), change: z.array(z.enum(CHANGE_TYPES)).min(1).max(3).optional() }).strict() }).strict(),
  z.object({ lines: linesLeaf }).strict(),
  z.object({ rule: kebab }).strict(),
  z.object({ facts: z.object({ kinds, same_file: z.boolean().optional(), same_symbol: z.boolean().optional() }).strict() }).strict(),
  z.object({ path: z.object({ entry: globs.optional(), sink: kinds, through: kinds.optional() }).strict() }).strict(),
  z.object({ indicator: z.object({ campaign: z.string().min(1).max(100).optional(), kind: z.enum(INDICATOR_KINDS).optional() }).strict() }).strict(),
  z.object({ context: whenSchema }).strict(),
])

export type Leaf = z.infer<typeof leafSchema>
export type Condition = Leaf | { all: Condition[] } | { any: Condition[] } | { not: Condition }

export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    leafSchema,
    z.object({ all: z.array(conditionSchema).min(1).max(MAX_CHILDREN) }).strict(),
    z.object({ any: z.array(conditionSchema).min(1).max(MAX_CHILDREN) }).strict(),
    z.object({ not: conditionSchema }).strict(),
  ]),
)

export function treeShape(condition: Condition): { depth: number; leaves: number } {
  const children = "all" in condition ? condition.all : "any" in condition ? condition.any : "not" in condition ? [condition.not] : null
  if (!children) return { depth: 1, leaves: 1 }
  const shapes = children.map(treeShape)
  return { depth: 1 + Math.max(...shapes.map((s) => s.depth)), leaves: shapes.reduce((n, s) => n + s.leaves, 0) }
}

export const withinSchema = z
  .object({ commits: z.number().int().min(1).max(MAX_WITHIN_COMMITS).optional(), days: z.number().int().min(1).max(MAX_WITHIN_DAYS).optional() })
  .strict()
  .refine((w) => w.commits !== undefined || w.days !== undefined, "Give commits, days, or both")

export const advancedSchema = z
  .object({ when: conditionSchema, within: withinSchema.optional() })
  .strict()
  .superRefine((a, ctx) => {
    const shape = treeShape(a.when)
    if (shape.depth > MAX_CONDITION_DEPTH) ctx.addIssue({ code: "custom", path: ["when"], message: `Nested deeper than ${MAX_CONDITION_DEPTH}` })
    if (shape.leaves > MAX_CONDITION_LEAVES) ctx.addIssue({ code: "custom", path: ["when"], message: `More than ${MAX_CONDITION_LEAVES} conditions` })
  })

export const responseSchema = z.union([
  z.object({ investigate: z.object({ focus: z.enum(FOCUS_IDS), max_tokens: z.number().int().min(256).max(MAX_INVESTIGATE_TOKENS).optional() }).strict() }).strict(),
  z
    .object({
      detonate: z
        .object({ phases: z.array(z.enum(DETONATE_PHASES)).min(1).max(DETONATE_PHASES.length), check: kebab.optional() })
        .strict()
        .refine((d) => !d.check === !d.phases.includes("check"), "A check phase needs a check, and a check needs the check phase"),
    })
    .strict(),
  z.object({ meta_alert: z.literal(true) }).strict(),
  z.object({ snapshot_tags: z.literal(true) }).strict(),
])

export type Advanced = z.infer<typeof advancedSchema>
export type Within = z.infer<typeof withinSchema>
export type RuleResponse = z.infer<typeof responseSchema>
export type DetonatePhase = (typeof DETONATE_PHASES)[number]
