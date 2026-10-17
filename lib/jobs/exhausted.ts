import { processMatches } from "@/lib/alerts"
import { fromPullRequest, fromPush, type ChangeEvent } from "@/lib/change-event"
import { activeInstallation, setReviewSessionStatus, updateScan } from "@/lib/db"
import { ownerOf } from "@/lib/finding"
import { fileFindingsAlert } from "@/lib/findings-alert"
import { toFinding } from "@/lib/finding"
import { logger } from "@/lib/logger"
import type { JobMessage } from "@/schemas/job"

const NOT_EVALUATED = {
  id: "change-not-evaluated",
  severity: "high" as const,
  description: "Pushguard gave up evaluating this change after repeated failures",
}

const RATE_LIMITED = {
  id: "github-rate-limited",
  severity: "high" as const,
  description: "GitHub's rate limit outlasted every retry, so this change was never evaluated",
}

// A job that will not run again is reported, never dropped: a reader cannot
// tell "we did not look" from "nothing found".
export async function reportExhausted(message: JobMessage, rateLimited: boolean): Promise<void> {
  try {
    if (message.type === "push") {
      await fileNotEvaluated(message.payload.repository.owner.login, fromPush(message.payload), rateLimited)
    } else if (message.type === "pull_request") {
      await fileNotEvaluated(message.payload.repository.owner.login, fromPullRequest(message.payload, []), rateLimited)
    } else if (message.type === "scan") {
      await updateScan(message.id, {
        status: "failed",
        error: rateLimited ? "GitHub rate limit outlasted every retry" : "Scan could not finish",
        errorCode: rateLimited ? "rate_limited" : "internal",
        finishedAt: new Date(),
        active: null,
      })
    } else if (message.type === "review_session") {
      await setReviewSessionStatus(message.id, { status: "failed", finishedAt: new Date() })
    } else if (message.type in UNWATCHED && "repo" in message) {
      await fileUnwatched(message.repo, UNWATCHED[message.type as keyof typeof UNWATCHED], rateLimited)
    }
  } catch (error) {
    logger.error("job_exhausted_report_failed", {
      type: message.type,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

const UNWATCHED = {
  tag_snapshot: "Tags were not compared with the last snapshot, so a repoint may have gone unseen.",
  tag_posture: "Whether this repository's tags are protected could not be checked.",
  workflow_logs: "A workflow run's logs were not scanned for secrets.",
  investigate: "The AI investigator never finished verifying a high-severity finding; the finding stands unverified.",
}

async function fileUnwatched(repo: string, line: string, rateLimited: boolean): Promise<void> {
  const installation = await activeInstallation(ownerOf(repo))
  if (!installation) return
  const finding = toFinding(rateLimited ? RATE_LIMITED : NOT_EVALUATED, repo, [], [line], { prose: true })
  await fileFindingsAlert({ installationId: installation.installationId, repo, findings: [finding], source: "push", intro: line, repeat: line })
}

async function fileNotEvaluated(org: string, event: ChangeEvent, rateLimited: boolean): Promise<void> {
  const installation = await activeInstallation(org)
  if (!installation) return
  const finding = toFinding(rateLimited ? RATE_LIMITED : NOT_EVALUATED, event.repo, [], [
    `No rules ran against \`${event.after.slice(0, 7)}\` on \`${event.branch}\`. Review it by hand.`,
  ], { prose: true })
  await processMatches(installation, event, [], null, [finding])
}
