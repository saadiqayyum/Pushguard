import { MAX_PENDING_REVIEW_MESSAGES, MAX_PENDING_REVIEW_PATHS } from "@/lib/db/limits"
import type { PendingReview } from "@/schemas/ai-review"

// One review covers every push since the oldest one waiting: the oldest
// before, the newest after, every path either touched (the later change wins).
export function widenReview(pending: PendingReview | null, incoming: PendingReview): PendingReview {
  if (!pending) return incoming
  const files = new Map(pending.files.map((f) => [f.path, f.changeType]))
  for (const f of incoming.files) {
    files.delete(f.path)
    files.set(f.path, f.changeType)
  }
  const merged = [...files].map(([path, changeType]) => ({ path, changeType }))
  const unreviewed = [pending.context.unreviewed, incoming.context.unreviewed]
  return {
    installationId: incoming.installationId,
    event: { ...incoming.event, before: pending.event.before, forced: pending.event.forced || incoming.event.forced },
    files: merged.slice(-MAX_PENDING_REVIEW_PATHS),
    truncated: pending.truncated || incoming.truncated || merged.length > MAX_PENDING_REVIEW_PATHS,
    context: {
      senderFirstPush: pending.context.senderFirstPush || incoming.context.senderFirstPush,
      branchCreated: pending.context.branchCreated || incoming.context.branchCreated,
      authorMismatch: pending.context.authorMismatch || incoming.context.authorMismatch,
      unreviewed: unreviewed.includes(true) ? true : unreviewed.includes(null) ? null : false,
      hourUtc: incoming.context.hourUtc,
      commitMessages: [...pending.context.commitMessages, ...incoming.context.commitMessages].slice(-MAX_PENDING_REVIEW_MESSAGES),
    },
    alert: incoming.alert ?? pending.alert,
  }
}

// A waiting range whose job was lost (archived, never run) is queued again
// rather than widened forever.
export function needsReviewJob(queuedAt: Date | null, now: Date, staleSeconds: number): boolean {
  return queuedAt === null || now.getTime() - queuedAt.getTime() > staleSeconds * 1000
}
