import { z } from "zod"
import { ruleSchema } from "@/schemas/rule"
import { checkedRuleSchema } from "@/schemas/rule-safety"

// No org: rules belong to the caller's account and apply to all of its orgs.
export const createRuleBody = z.object({ rule: checkedRuleSchema }).strict()

// No free text. The client picks from what GitHub said the user can reach, and
// the server re-checks the choice against that same list. An installation id
// and a repository name are the only things that can be asked for.
export const createScanBody = z
  .object({
    installationId: z.number().int().positive(),
    // Omitted means "every repository I can read in this installation".
    repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/, "Expected owner/repo").optional(),
    // A git ref, so slashes are legal (`release/1.2`) but traversal is not.
    // Only meaningful with `repo`: scanning a whole account reads each
    // repository's own default branch, and they do not share branch names.
    branch: z
      .string()
      .min(1)
      .max(255)
      .regex(/^[A-Za-z0-9._\/-]+$/, "Not a valid branch name")
      .refine((b) => !b.includes("..") && !b.startsWith("/") && !b.endsWith("/"), "Not a valid branch name")
      .optional(),
  })
  .strict()
  .refine((b) => !b.branch || b.repo, { message: "branch requires repo" })

// Which repositories to file. Absent means everything not already filed.
export const fileScanBody = z
  .object({
    repos: z.array(z.string().regex(/^[^/\s]+\/[^/\s]+$/)).min(1).max(50).optional(),
  })
  .strict()

// Bulk triage. Archiving is ours; closing reaches GitHub and needs write access.
export const bulkAlertsBody = z
  .object({
    ids: z.array(z.string().regex(/^[^/\s]+\/[^/\s]+#\d+$/)).min(1).max(100),
    action: z.enum(["archive", "unarchive", "close"]),
  })
  .strict()

// A whole rules file, YAML or JSON, as text. Capped so a paste cannot become a
// denial of service; the schema decides whether the contents are legal.
export const importRulesBody = z.object({ content: z.string().min(1).max(200_000) }).strict()

export const updateRuleBody = z
  .object({
    rule: checkedRuleSchema.optional(),
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
        senderFirstPush: z.boolean().default(false),
        branchCreated: z.boolean().default(false),
        branchDeleted: z.boolean().default(false),
        authorMismatch: z.boolean().default(false),
        unreviewed: z.boolean().nullable().default(null),
        commitMessages: z.array(z.string()).max(50).default([]),
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
        senderFirstPush: false,
        branchCreated: false,
        branchDeleted: false,
        authorMismatch: false,
        unreviewed: null,
        commitMessages: [],
        files: [],
      })),
  })
  .strict()

export type CreateRuleBody = z.infer<typeof createRuleBody>
export type UpdateRuleBody = z.infer<typeof updateRuleBody>
export type TestRuleBody = z.infer<typeof testRuleBody>
