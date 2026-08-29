import { z } from "zod"
import { ruleSchema } from "@/schemas/rule"

// No org: rules belong to the caller's account and apply to all of its orgs.
export const createRuleBody = z.object({ rule: ruleSchema }).strict()

export const updateInstallationBody = z
  .object({
    // "" clears the override: alerts go to the repo that triggered them.
    alertsRepo: z
      .union([z.string().regex(/^[^/\s]+\/[^/\s]+$/, "Expected owner/repo"), z.literal("")])
      .optional(),
    alertMention: z.union([z.string().startsWith("@"), z.literal("")]).optional(),
  })
  .strict()
  .refine((b) => b.alertsRepo !== undefined || b.alertMention !== undefined, {
    message: "Provide alertsRepo or alertMention",
  })

export const updateRuleBody = z
  .object({
    rule: ruleSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine((b) => b.rule !== undefined || b.enabled !== undefined, {
    message: "Provide rule or enabled",
  })

export const testRuleBody = z
  .object({
    rule: ruleSchema,
    sample: z
      .object({
        repo: z.string().default("acme/example"),
        branch: z.string().default("main"),
        forced: z.boolean().default(false),
        branchCreated: z.boolean().default(false),
        branchDeleted: z.boolean().default(false),
        files: z
          .array(
            z.object({
              path: z.string(),
              changeType: z.enum(["added", "modified", "removed"]).default("modified"),
            }),
          )
          .default([]),
        diff: z.string().max(100_000).optional(),
      })
      .default(() => ({
        repo: "acme/example",
        branch: "main",
        forced: false,
        branchCreated: false,
        branchDeleted: false,
        files: [],
      })),
  })
  .strict()

export type CreateRuleBody = z.infer<typeof createRuleBody>
export type UpdateRuleBody = z.infer<typeof updateRuleBody>
export type TestRuleBody = z.infer<typeof testRuleBody>
