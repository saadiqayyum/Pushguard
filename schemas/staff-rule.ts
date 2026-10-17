import { z } from "zod"
import { INDICATOR_KINDS } from "./threat-intel"
import { CHANGE_TYPES, ruleChecks, ruleFields, whenFields } from "./rule"

export const MAX_EXPLANATION = 20_000
export const MAX_CHECK_BYTES = 64 * 1024
export const CHECK_LANGUAGES = ["sh", "node", "python"] as const
const MAX_INCIDENTS = 20
const MAX_REFERENCES = 30
const MAX_DOCS = 10
const MAX_FIXTURES = 10
const MAX_FIXTURE_COMMITS = 20
const MAX_FIXTURE_FILES = 50
const MAX_FIXTURE_LINES = 200
const MAX_FIXTURE_LINE = 1_000
const MAX_FIXTURE_INDICATORS = 20

// Rendered as links in the dashboard and in issues, so only https.
const httpsUrl = z.string().max(2048).url().refine((u) => u.startsWith("https://"), "Use an https URL")

// Fixture content is test data for the pure evaluator: parsed, never written to disk or run.
const fixtureSchema = z
  .object({
    name: z.string().min(1).max(120),
    commits: z
      .array(
        z
          .object({
            files: z
              .array(
                z
                  .object({
                    path: z.string().min(1).max(1024),
                    change: z.enum(CHANGE_TYPES),
                    added: z.array(z.string().max(MAX_FIXTURE_LINE)).max(MAX_FIXTURE_LINES).optional(),
                    removed: z.array(z.string().max(MAX_FIXTURE_LINE)).max(MAX_FIXTURE_LINES).optional(),
                  })
                  .strict(),
              )
              .min(1)
              .max(MAX_FIXTURE_FILES),
            message: z.string().max(1_000).optional(),
            context: whenFields
              .extend({
                hour_utc: z.number().int().min(0).max(23).optional(),
                indicators: z.array(z.object({ campaign: z.string().max(100), kind: z.enum(INDICATOR_KINDS) }).strict()).max(MAX_FIXTURE_INDICATORS).optional(),
              })
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_FIXTURE_COMMITS),
  })
  .strict()

export type Fixture = z.infer<typeof fixtureSchema>

// A rule as staff publish it: the rule itself plus what only the console and
// the filed issue read. Fixtures are required for any rule not in the catalog.
export const staffRuleSchema = z
  .object({
    ...ruleFields,
    explanation: z.string().max(MAX_EXPLANATION).optional(),
    incidents: z
      .array(
        z
          .object({
            name: z.string().min(1).max(120),
            date: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/, "Use YYYY-MM or YYYY-MM-DD"),
            url: httpsUrl,
            note: z.string().max(500).optional(),
          })
          .strict(),
      )
      .max(MAX_INCIDENTS)
      .optional(),
    references: z.array(z.object({ title: z.string().min(1).max(200), url: httpsUrl }).strict()).max(MAX_REFERENCES).optional(),
    docs: z.array(z.string().max(200).regex(/^docs\/attacks\/[a-z0-9_/-]+\.md$/, "A path under docs/attacks")).max(MAX_DOCS).optional(),
    fixtures: z.object({ malicious: z.array(fixtureSchema).min(1).max(MAX_FIXTURES), benign: z.array(fixtureSchema).min(1).max(MAX_FIXTURES) }).strict().optional(),
  })
  .strict()
  .superRefine(ruleChecks)

export type StaffRule = z.infer<typeof staffRuleSchema>
export type CheckLanguage = (typeof CHECK_LANGUAGES)[number]

export const STAFF_ONLY = ["explanation", "incidents", "references", "docs", "fixtures"] as const

// The rule the engine runs and the dashboard lists.
export function ruleOf(staff: StaffRule): Omit<StaffRule, (typeof STAFF_ONLY)[number]> {
  const rule: Record<string, unknown> = { ...staff }
  for (const key of STAFF_ONLY) delete rule[key]
  return rule as Omit<StaffRule, (typeof STAFF_ONLY)[number]>
}
