import { filesForRule } from "@/lib/ai-rule-scope"
import { getActiveAiRules, runAiRules } from "@/lib/ai-rules"
import { resolveAlertTarget } from "@/lib/alert-target"
import { processMatches } from "@/lib/alerts"
import type { ChangeEvent } from "@/lib/change-event"
import { alertForCommit, claimPendingReview, enqueueJob, installationById, stagePendingReview, type InstallationDoc } from "@/lib/db"
import type { PushContext } from "@/lib/engine"
import { escalateOnto, type FiledRef } from "@/lib/escalate"
import { toFinding } from "@/lib/finding"
import { logger } from "@/lib/logger"
import type { JobMessage } from "@/schemas/job"
import { AI_REVIEW_DELAY_SECONDS, AI_REVIEW_STALE_SECONDS } from "./limits"

type AiReviewJob = Extract<JobMessage, { type: "ai_review" }>

const PARTIAL = {
  id: "ai-review-partial",
  severity: "medium" as const,
  description: "More files changed in this range than one AI review lists, so AI rules saw only part of it",
}

// Queues, or widens, the AI review of this push's branch when any AI rule
// would read something in it. The review itself runs later, outside the push.
export async function queueAiReview(installation: InstallationDoc, event: ChangeEvent, context: PushContext, alert: FiledRef | null): Promise<void> {
  const rules = await getActiveAiRules(installation.org)
  const applies = rules.some((rule) => rule.scope === "changed" && filesForRule(rule, event.repo, event.branch, context.files, context).length > 0)
  if (!applies) return
  const enqueue = await stagePendingReview(
    {
      installationId: installation.installationId,
      event: { repo: event.repo, private: event.private, branch: event.branch, sender: event.sender, senderEmail: event.senderEmail, before: event.before, after: event.after, forced: event.forced },
      files: context.files,
      truncated: false,
      context: {
        senderFirstPush: context.senderFirstPush,
        branchCreated: context.branchCreated,
        authorMismatch: context.authorMismatch,
        unreviewed: context.unreviewed,
        hourUtc: context.hourUtc,
        commitMessages: context.commitMessages.map((m) => m.slice(0, 2_000)),
      },
      alert,
    },
    AI_REVIEW_STALE_SECONDS,
  )
  if (enqueue) await enqueueJob({ type: "ai_review", repo: event.repo, branch: event.branch }, AI_REVIEW_DELAY_SECONDS)
  logger.info("ai_review_staged", { repo: event.repo, branch: event.branch, queued: enqueue })
}

// Runs the AI rules over the whole waiting range. Findings escalate the alert
// already filed for it, or file one; they never lower or close anything.
export async function runAiReview(job: AiReviewJob): Promise<void> {
  const review = await claimPendingReview(job.repo, job.branch)
  if (!review) return
  const installation = await installationById(review.installationId)
  if (!installation) return
  const event: ChangeEvent = { ...review.event, files: review.files }
  const context: PushContext = {
    ...review.context,
    event: "push",
    repo: job.repo,
    branch: job.branch,
    forced: review.event.forced,
    branchDeleted: false,
    files: review.files,
  }
  const findings = await runAiRules(installation, job.repo, job.branch, review.event.after, review.files, context)
  if (review.truncated) {
    findings.push(toFinding(PARTIAL, job.repo, [], [`Only the latest ${review.files.length} changed paths of this range were offered to AI rules.`], { prose: true }))
  }
  logger.info("ai_review_ran", { repo: job.repo, branch: job.branch, before: review.event.before, after: review.event.after, findings: findings.length })
  if (findings.length === 0) return

  const target = resolveAlertTarget(job.repo, review.event.private)
  const existing = review.alert ?? (await alertForCommit(target.repo, review.event.after))
  if (existing) {
    const ref = "redact" in existing ? existing : { target: target.repo, number: existing.number, redact: target.redactContent }
    await escalateOnto(installation.installationId, ref, "AI rules", findings)
    return
  }
  await processMatches(installation, event, [], null, findings)
}
