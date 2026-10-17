import { isThirdParty, parseUses } from "@/lib/action-pins"
import { LOGS_FORBIDDEN_LOG_WINDOW_SECONDS, MAX_LOG_ENTRIES, MAX_LOG_UNZIPPED_BYTES, MAX_LOG_ZIP_BYTES } from "@/lib/ci-limits"
import { activeInstallation, hit } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { ownerOf, toFinding } from "@/lib/finding"
import { fileFindingOnce, fileFindingsAlert } from "@/lib/findings-alert"
import { fetchRawFile } from "@/lib/github"
import { downloadRunLogs } from "@/lib/github-refs"
import { logger } from "@/lib/logger"
import { scanLog } from "@/lib/log-secrets"
import { readZip } from "@/lib/zip"
import type { JobMessage } from "@/schemas/job"

type LogsJob = Extract<JobMessage, { type: "workflow_logs" }>

const SECRETS_IN_LOGS = {
  id: "secrets-in-logs",
  severity: "critical" as const,
  description: "A workflow run printed something shaped like a secret dump to its log",
}
const LOGS_NOT_READ = {
  id: "logs-not-fully-read",
  severity: "medium" as const,
  description: "A workflow run's logs exceeded the read cap, so part of them was never scanned",
}

// tj-actions dumped runner memory into the run's own log, double base64'd.
// Only runs that pull in a third-party action are read; unsure means read.
export async function scanWorkflowLogs(job: LogsJob): Promise<void> {
  const installation = await activeInstallation(ownerOf(job.repo))
  if (!installation) return
  const { installationId } = installation
  if (!(await usesThirdParty(installationId, job))) return

  let zip: Buffer | null
  try {
    zip = await downloadRunLogs(installationId, job.repo, job.runId, MAX_LOG_ZIP_BYTES)
  } catch (error) {
    if (error instanceof AppError && error.code === "forbidden") {
      if ((await hit(`logs-forbidden:${installation.org}`, LOGS_FORBIDDEN_LOG_WINDOW_SECONDS)).count === 1) {
        logger.warn("workflow_logs_forbidden", { org: installation.org, repo: job.repo, hint: "grant the App Actions: read" })
      }
      return
    }
    if (error instanceof AppError && error.code === "payload_too_large") return notRead(installationId, job, `over ${MAX_LOG_ZIP_BYTES / 1_000_000} MB compressed`)
    throw error
  }
  if (!zip) return

  const { entries, truncated } = readZip(zip, { maxEntries: MAX_LOG_ENTRIES, maxBytes: MAX_LOG_UNZIPPED_BYTES })
  const lines = entries.flatMap((entry) => scanLog(entry.text).map((hit) => `${where(entry.name)}, line ${hit.line}: ${hit.sample}`))
  if (lines.length > 0) {
    await fileFindingsAlert({
      installationId,
      repo: job.repo,
      findings: [toFinding(SECRETS_IN_LOGS, job.repo, [job.workflowPath], [`Workflow "${job.name}", run ${job.url}`, ...lines])],
      source: "push",
      intro: `A run of \`${job.workflowPath}\` printed secret-shaped output. Treat every secret that workflow can read as leaked, rotate them, and delete the run's logs.`,
      repeat: `Seen again in run ${job.url}.`,
    })
  }
  if (truncated) await notRead(installationId, job, `more than ${MAX_LOG_ENTRIES} files or ${MAX_LOG_UNZIPPED_BYTES / 1_000_000} MB unpacked`)
  logger.info("workflow_logs_scanned", { repo: job.repo, runId: job.runId, files: entries.length, hits: lines.length, truncated })
}

function notRead(installationId: number, job: LogsJob, why: string): Promise<void> {
  return fileFindingOnce(installationId, job.repo, toFinding(LOGS_NOT_READ, job.repo, [job.workflowPath], [
    `Run ${job.url} logs were ${why}; the rest was not scanned for secrets.`,
  ]), `Logs of \`${job.workflowPath}\` were only partly scanned.`)
}

// Log archives hold `job/3_step name.txt`; the name is the only step label there is.
function where(name: string): string {
  const [job, step] = name.includes("/") ? name.split("/", 2) : [name.replace(/\.txt$/, ""), ""]
  return step ? `job "${job}", step "${step.replace(/\.txt$/, "").replace(/^\d+_/, "")}"` : `job "${job.replace(/^\d+_/, "")}"`
}

async function usesThirdParty(installationId: number, job: LogsJob): Promise<boolean> {
  try {
    const lines = (await fetchRawFile(installationId, job.repo, job.headSha, job.workflowPath)).split("\n")
    const local = lines.some((line) => /^\s*-?\s*uses\s*:\s*["']?\.\//.test(line))
    return local || lines.map(parseUses).some((action) => action !== null && isThirdParty(action))
  } catch (error) {
    if (error instanceof AppError && error.code === "rate_limited") throw error
    return true
  }
}
