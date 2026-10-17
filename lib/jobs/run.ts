import { syncManyRepos, syncOrgMembers, syncRepoAccess, syncTeamMember, syncTeamRepo } from "@/lib/access"
import { indexRepo } from "@/lib/code-index"
import {
  activeInstallation,
  archiveJob,
  deleteJob,
  delayJob,
  enqueueJob,
  readJobs,
  recordJobFailure,
  releaseRepoLock,
  resolveJobFailures,
  takeRepoLock,
  type QueuedJob,
} from "@/lib/db"
import { AppError } from "@/lib/errors"
import { GITHUB_FALLBACK_RETRY_AFTER_SECONDS } from "@/lib/github-limits"
import { logger } from "@/lib/logger"
import { evaluatePullRequest } from "@/lib/pull-requests"
import { advanceReviewSession } from "@/lib/review-session"
import { runInvestigation } from "@/lib/investigator"
import { draftRule } from "@/lib/contributor/draft"
import { fileQueuedScan } from "@/lib/scan-filing"
import { runScan } from "@/lib/scan-run"
import { sendMetaAlert } from "@/lib/meta-alerts"
import type { JobMessage } from "@/schemas/job"
import { reportExhausted } from "./exhausted"
import {
  INDEX_RATE_PAUSE_SECONDS,
  JOB_MAX_ATTEMPTS,
  JOB_START_FLOOR_MS,
  JOB_VISIBILITY_SECONDS,
  REPO_LOCK_LEASE_SECONDS,
  REPO_LOCK_RETRY_SECONDS,
} from "./limits"
import { runAiReview } from "./ai-review"
import { filePublicAlert } from "./public-alert"
import { evaluatePush } from "./push"
import { announceJob, jobScope } from "./announce"
import { announce } from "@/lib/realtime"
import { reconcileDeliveries } from "./reconcile"
import { alertDependabotMalware } from "@/lib/malicious-dependents"
import { registerMissedInstallation } from "./register-installation"
import { orphaned } from "./orphaned"
import { uninstallOrg } from "./uninstall"
import { fileSettingsAlert } from "./settings-alert"
import { ingestMaliciousPackages } from "./malicious-packages"
import { handleRunnerDeadline, handleRunnerReport } from "./runner"
import { snapshotTags } from "./tag-snapshot"
import { checkTagPosture } from "./tag-posture"
import { scanWorkflowLogs } from "./workflow-logs"

export type RunResult = { processed: number; retrying: number; delayed: number; exhausted: number }

// Must run inside asSystem. Jobs run one at a time; parallelism comes from
// pg_net waking several invocations, each reading its own messages.
export async function runJobs(budgetMs: number): Promise<RunResult> {
  const deadline = Date.now() + budgetMs
  const result: RunResult = { processed: 0, retrying: 0, delayed: 0, exhausted: 0 }

  while (deadline - Date.now() > JOB_START_FLOOR_MS) {
    const [job] = await readJobs(JOB_VISIBILITY_SECONDS, 1)
    if (!job) break
    const repo = orderedRepo(job.message)
    const holder = String(job.msgId)
    if (repo && !(await takeRepoLock(repo, holder, REPO_LOCK_LEASE_SECONDS))) {
      await delayJob(job.msgId, REPO_LOCK_RETRY_SECONDS)
      logger.info("job_waiting_for_repo", { msgId: job.msgId, type: job.message.type, repo })
      result.delayed++
      continue
    }
    const started = Date.now()
    try {
      if (await orphaned(job.message)) {
        await deleteJob(job.msgId)
        logger.info("job_orphaned", { msgId: job.msgId, type: job.message.type })
        continue
      }
      await dispatch(job.message)
      await deleteJob(job.msgId)
      await settled(job.message)
      result.processed++
      logger.info("job_done", { msgId: job.msgId, type: job.message.type, ms: Date.now() - started })
    } catch (error) {
      result[await settleFailure(job, error)]++
    } finally {
      if (repo) await releaseRepoLock(repo, holder).catch((error: unknown) => logger.warn("repo_lock_release_failed", { repo, error: String(error) }))
    }
  }
  return result
}

// Jobs that read and write one repository's derived state run one at a time per repository.
function orderedRepo(message: JobMessage): string | null {
  if (message.type === "push" || message.type === "pull_request") return message.payload.repository.full_name
  return message.type === "index" ? message.repo : null
}

async function settleFailure(job: QueuedJob, error: unknown): Promise<"retrying" | "delayed" | "exhausted"> {
  const limited = error instanceof AppError && error.code === "rate_limited"
  const fields = {
    msgId: job.msgId,
    type: job.message.type,
    attempt: job.readCount,
    code: error instanceof AppError ? error.code : "internal",
    error: error instanceof Error ? error.message : String(error),
    cause: causeOf(error),
  }

  if (job.readCount >= JOB_MAX_ATTEMPTS) {
    await archiveJob(job.msgId)
    logger.error("job_exhausted", fields)
    await reportExhausted(job.message, limited)
    await recordFailure(job.message, error)
    return "exhausted"
  }
  if (limited) {
    await delayJob(job.msgId, error.retryAfterSeconds ?? GITHUB_FALLBACK_RETRY_AFTER_SECONDS)
    logger.warn("job_rate_limited", { ...fields, retryAfter: error.retryAfterSeconds })
    return "delayed"
  }
  logger.warn("job_failed", fields)
  return "retrying"
}

async function dispatch(message: JobMessage): Promise<void> {
  switch (message.type) {
    case "push":
      return evaluatePush(message)
    case "pull_request": {
      const installation = await activeInstallation(message.payload.repository.owner.login)
      if (installation) await evaluatePullRequest(installation, message.payload, message.deliveryId)
      return
    }
    case "index": {
      const { complete, rateLimited } = await indexRepo(message)
      if (!complete) await enqueueJob(message, rateLimited ? INDEX_RATE_PAUSE_SECONDS : 0)
      return
    }
    case "sync_repos":
      return syncManyRepos(message.installationId, message.repos)
    case "sync_repo_access":
      await syncRepoAccess(message.installationId, message.repo)
      return
    case "sync_org_members":
      return syncOrgMembers(message.installationId, message.org)
    case "sync_team_repo":
      return syncTeamRepo(message.installationId, message.org, message.slug, message.repo, message.action)
    case "sync_team_member":
      return syncTeamMember(message.installationId, message.org, message.slug, message.login, message.action)
    case "review_session":
      return advanceReviewSession(message.id)
    case "investigate":
      return runInvestigation(message)
    case "ai_review":
      return runAiReview(message)
    case "scan":
      return runScan(message.id)
    case "public_alert":
      return filePublicAlert(message)
    case "file_scan":
      return fileQueuedScan(message)
    case "runner_report":
      return handleRunnerReport(message)
    case "runner_deadline":
      return handleRunnerDeadline(message)
    case "meta_alert":
      return sendMetaAlert(message)
    case "settings_alert":
      return fileSettingsAlert(message)
    case "reconcile_deliveries":
      return reconcileDeliveries()
    case "dependabot_malware":
      return alertDependabotMalware(message)
    case "register_installation":
      return registerMissedInstallation(message)
    case "uninstall":
      return uninstallOrg(message)
    case "malicious_packages":
      return ingestMaliciousPackages(message)
    case "tag_snapshot":
      return snapshotTags(message)
    case "tag_posture":
      return checkTagPosture(message)
    case "workflow_logs":
      return scanWorkflowLogs(message)
    case "contributor":
      return draftRule(message)
    default:
      return assertNever(message)
  }
}

function assertNever(message: never): never {
  throw new Error(`Unhandled job ${JSON.stringify(message)}`)
}

// A job that succeeded clears any failure recorded for the same work.
async function settled(message: JobMessage): Promise<void> {
  const scope = await jobScope(message)
  if (scope) await resolveJobFailures(scope.org, message.type, scope.subject)
  await announceJob(message)
}

async function recordFailure(message: JobMessage, error: unknown): Promise<void> {
  const scope = await jobScope(message)
  if (!scope) return
  const reason = causeOf(error) ?? (error instanceof Error ? error.message : "Unknown error")
  await recordJobFailure({ org: scope.org, type: message.type, subject: scope.subject, reason })
  await announce(scope.org, "sync")
}

// The upstream status and message behind an AppError, so a failed job says why.
function causeOf(error: unknown): string | undefined {
  const cause = (error as { cause?: { status?: number; message?: string } } | null)?.cause
  if (!cause) return undefined
  return [cause.status, cause.message?.slice(0, 200)].filter(Boolean).join(" ")
}
