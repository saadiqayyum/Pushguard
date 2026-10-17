import { z } from "zod"
import { CONTRIBUTOR_TEXT_MAX, CONTRIBUTOR_TITLE_MAX, CONTRIBUTOR_URL_MAX, CONTRIBUTOR_URLS_MAX } from "@/lib/contributor/limits"
import { DOC_PATH } from "@/lib/contributor/input"
import { STATUSES } from "@/lib/platform/lifecycle"
import { OVERRIDE_REASON_MAX } from "@/lib/platform/limits"

// Staff console contracts. Bodies are parsed again by the artifact's own schema.

const artifactId = z.string().min(1).max(100)

export const saveStaffRuleBody = z.object({ rule: z.record(z.string(), z.unknown()), isNew: z.boolean() }).strict()
export const runFixturesBody = z.object({ rule: z.record(z.string(), z.unknown()) }).strict()

export const transitionBody = z
  .object({
    kind: z.enum(["rule", "check"]),
    id: artifactId,
    version: z.number().int().min(1),
    to: z.enum(STATUSES),
    override: z.string().max(OVERRIDE_REASON_MAX).optional(),
  })
  .strict()

export const contributorRequestBody = z.discriminatedUnion("source", [
  z
    .object({
      source: z.literal("incident"),
      title: z.string().trim().min(1).max(CONTRIBUTOR_TITLE_MAX),
      text: z.string().trim().min(1).max(CONTRIBUTOR_TEXT_MAX),
      urls: z.array(z.string().url().max(CONTRIBUTOR_URL_MAX)).max(CONTRIBUTOR_URLS_MAX),
    })
    .strict(),
  z.object({ source: z.literal("doc"), docPath: z.string().max(200).regex(DOC_PATH) }).strict(),
])

export const inboxStateBody = z.object({ state: z.enum(["new", "dismissed"]) }).strict()

export const savedOut = z.object({ id: z.string(), version: z.number().int() })
export const checkSavedOut = savedOut.extend({ sha256: z.string() })
export const problemsOut = z.object({ problems: z.array(z.string()) })
export const fixtureRunOut = z.object({
  problems: z.array(z.string()),
  fixtures: z
    .object({
      passed: z.boolean(),
      results: z.array(z.object({ fixture: z.string(), expected: z.enum(["hit", "clean"]), got: z.enum(["hit", "clean"]) })),
    })
    .nullable(),
})
export const queuedOut = z.object({ queued: z.literal(true) })
