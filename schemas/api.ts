import { z } from "zod"
import { ruleSchema } from "@/schemas/rule"
import { checkedRuleSchema } from "@/schemas/rule-safety"

// No org: rules belong to the caller's account and apply to all of its orgs.
export const createRuleBody = z.object({ rule: checkedRuleSchema }).strict()

// No free text. The client picks from what GitHub said the user can reach, and.
export const createScanBody = z
  .object({
    installationId: z.number().int().positive(),
    // Which stored key pays for this scan's AI rules. Absent means run none:
    // a scan that spends money should be one somebody chose to spend on.
    aiKey: z.string().uuid().optional(),
    repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/, "Expected owner/repo").optional(),
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

// Adding a key.
export const addAiKeyBody = z
  .object({
    label: z.string().trim().min(1).max(40),
    provider: z.enum(["anthropic", "openai", "google-genai"]),
    // Trimmed: a key pasted with a trailing newline is stored verbatim and then
    // sent as an HTTP header, which the provider answers with a 401 that looks
    // like a wrong key rather than a stray character.
    apiKey: z.string().trim().min(16).max(400),
    model: z.string().trim().min(2).max(64),
    effort: z.enum(["low", "medium", "high"]).default("medium"),
  })
  .strict()

// Changing which key runs when a rule does not name one.
export const aiSettingsBody = z.object({ defaultKey: z.string().uuid() }).strict()

// Editing one. The secret is optional; sending one replaces it.
export const editAiKeyBody = addAiKeyBody.partial({ apiKey: true })

export type AddAiKeyBody = z.infer<typeof addAiKeyBody>
export type EditAiKeyBody = z.infer<typeof editAiKeyBody>
export type AiSettingsBody = z.infer<typeof aiSettingsBody>
