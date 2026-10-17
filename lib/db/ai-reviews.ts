import { and, eq } from "drizzle-orm"
import { jsonb, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import { needsReviewJob, widenReview } from "@/lib/ai-review-range"
import { logger } from "@/lib/logger"
import { pendingReviewSchema, type PendingReview } from "@/schemas/ai-review"
import { app, q, systemAccess } from "./client"

// At most one waiting AI review per repository branch. The row is the range;
// the queued job carries only its key.
export const pendingAiReviews = app
  .table(
    "pending_ai_reviews",
    {
      repo: text().notNull(),
      branch: text().notNull(),
      review: jsonb().$type<PendingReview>().notNull(),
      queuedAt: timestamp({ withTimezone: true }).notNull(),
    },
    (t) => [systemAccess("pending_ai_reviews"), primaryKey({ columns: [t.repo, t.branch] })],
  )
  .enableRLS()

const key = (repo: string, branch: string) => and(eq(pendingAiReviews.repo, repo), eq(pendingAiReviews.branch, branch))

function parsed(repo: string, raw: unknown): PendingReview | null {
  const result = pendingReviewSchema.safeParse(raw)
  if (!result.success) logger.warn("pending_review_invalid", { repo, issues: result.error.issues.length })
  return result.success ? result.data : null
}

// Widens the waiting range, or opens one. True when the caller must queue the job.
export async function stagePendingReview(incoming: PendingReview, staleSeconds: number): Promise<boolean> {
  const { repo, branch } = incoming.event
  const now = new Date()
  return q(async (tx) => {
    const [row] = await tx.select().from(pendingAiReviews).where(key(repo, branch)).for("update")
    const review = pendingReviewSchema.parse(widenReview(row ? parsed(repo, row.review) : null, incoming))
    const enqueue = needsReviewJob(row?.queuedAt ?? null, now, staleSeconds)
    const queuedAt = enqueue ? now : row!.queuedAt
    await tx
      .insert(pendingAiReviews)
      .values({ repo, branch, review, queuedAt })
      .onConflictDoUpdate({ target: [pendingAiReviews.repo, pendingAiReviews.branch], set: { review, queuedAt } })
    return enqueue
  })
}

export async function claimPendingReview(repo: string, branch: string): Promise<PendingReview | null> {
  const rows = await q((tx) => tx.delete(pendingAiReviews).where(key(repo, branch)).returning({ review: pendingAiReviews.review }))
  return rows[0] ? parsed(repo, rows[0].review) : null
}
