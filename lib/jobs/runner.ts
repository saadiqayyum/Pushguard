import { enqueueJob, runnerJob, type RunnerJobDoc } from "@/lib/db"
import { fileFindingsAlert } from "@/lib/findings-alert"
import { deleteRunnerLabel } from "@/lib/github"
import { logger } from "@/lib/logger"
import { FETCH_NONCE_TTL_MS } from "@/lib/runner/limits"
import { expiredRunnerFindings, runnerFindings } from "@/lib/runner/results"
import { open } from "@/lib/secret-box"
import type { JobMessage } from "@/schemas/job"

const intro = (job: Pick<RunnerJobDoc, "kind" | "repo" | "sha">) =>
  `Runner ${job.kind === "detonate" ? "detonation" : "scan"} of \`${job.repo}\` at \`${job.sha.slice(0, 7)}\`.`

export const RUNNER_DEADLINE_DELAY_SECONDS = Math.ceil(FETCH_NONCE_TTL_MS / 1000) + 60

export async function fileRunnerFindings(job: RunnerJobDoc): Promise<void> {
  const findings = await runnerFindings(job.id)
  if (!findings?.length) return
  await fileFindingsAlert({
    installationId: job.installationId,
    repo: job.repo,
    findings,
    source: "push",
    intro: intro(job),
    repeat: `${intro(job)} Seen again.`,
  })
}

export async function handleRunnerReport({ jobId }: Extract<JobMessage, { type: "runner_report" }>): Promise<void> {
  const job = await runnerJob(jobId)
  if (job) await fileRunnerFindings(job)
}

// A runner that never fetched or never reported says so as a finding, and an
// unfetched job's label is removed. Inside its window the deadline re-queues itself.
export async function handleRunnerDeadline({ jobId }: Extract<JobMessage, { type: "runner_deadline" }>): Promise<void> {
  for (const expired of await expiredRunnerFindings()) {
    const job = await runnerJob(expired.jobId)
    if (!job) continue
    const label = job.label ? open(job.label) : null
    if (label && job.runnerRepo && job.runnerInstallationId) await deleteRunnerLabel(job.runnerInstallationId, job.runnerRepo, label)
    await fileRunnerFindings(job)
  }
  const job = await runnerJob(jobId)
  if (!job || (job.status !== "dispatched" && job.status !== "fetched")) return
  const due = job.status === "fetched" ? job.reportExpiresAt : job.fetchNonceExpiresAt
  const wait = due ? Math.max(60, Math.ceil((due.getTime() - Date.now()) / 1000) + 30) : RUNNER_DEADLINE_DELAY_SECONDS
  await enqueueJob({ type: "runner_deadline", jobId }, wait)
  logger.info("runner_deadline_requeued", { jobId, status: job.status, wait })
}
