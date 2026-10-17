import { z } from "zod"
import { MAX_PENDING_REVIEW_MESSAGES, MAX_PENDING_REVIEW_PATHS } from "@/lib/db/limits"
import { CHANGE_TYPES } from "./rule"

const ref = z.string().max(255)
const repoName = z.string().regex(/^[^/\s]+\/[^/\s]+$/).max(200)

// A push range waiting for its AI review, widened by each push that lands
// before the review runs. Stored as jsonb and parsed on every read.
export const pendingReviewSchema = z.object({
  installationId: z.number().int().positive(),
  event: z.object({
    repo: repoName,
    private: z.boolean(),
    branch: ref,
    sender: z.string().max(100),
    senderEmail: z.string().max(320).nullable(),
    before: ref,
    after: ref,
    forced: z.boolean(),
  }),
  files: z.array(z.object({ path: z.string().max(1024), changeType: z.enum(CHANGE_TYPES) })).max(MAX_PENDING_REVIEW_PATHS),
  truncated: z.boolean(),
  context: z.object({
    senderFirstPush: z.boolean(),
    branchCreated: z.boolean(),
    authorMismatch: z.boolean(),
    unreviewed: z.boolean().nullable(),
    hourUtc: z.number().int().min(0).max(23),
    commitMessages: z.array(z.string().max(2_000)).max(MAX_PENDING_REVIEW_MESSAGES),
  }),
  alert: z.object({ target: repoName, number: z.number().int().positive(), redact: z.boolean() }).nullable(),
})

export type PendingReview = z.infer<typeof pendingReviewSchema>
