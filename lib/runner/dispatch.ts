import { publishedCheckScript } from "@/lib/db/check-scripts"
import { createRunnerJob, failRunnerJob, mintRunnerToken, runnerJobsThisMonth } from "@/lib/db/runner-jobs"
import { env } from "@/lib/env"
import { toFinding } from "@/lib/finding"
import { fileFindingOnce } from "@/lib/findings-alert"
import { createRunnerLabel, repoInstallationId } from "@/lib/github"
import { logger } from "@/lib/logger"
import { SHARED_RUNNER_MONTHLY_QUOTA } from "@/lib/runner/limits"
import { runnerLabel } from "@/lib/runner/target"
import { seal } from "@/lib/secret-box"
import type { DetonatePhase } from "@/schemas/rule-advanced"
import type { RunnerKind } from "@/schemas/runner"

export type DetonationRequest = { phases: DetonatePhase[]; checkScript?: string }

export type DispatchResult = { status: "dispatched"; jobId: string } | { status: "detonation-unavailable" }

const QUOTA_REACHED = {
  id: "detonation-quota-reached",
  severity: "low" as const,
  description: "The monthly detonation quota on the Pushguard-hosted runner is used up",
}

let sharedInstallation: number | undefined

// Detonation always runs on the Pushguard-hosted runner; its installation id is
// resolved once per process.
async function runnerTarget(): Promise<{ repo: string; installationId: number } | null> {
  const repo = env().RUNNER_REPO
  if (!repo) return null
  sharedInstallation ??= (await repoInstallationId(repo)) ?? undefined
  if (sharedInstallation === undefined) {
    logger.error("shared_runner_not_installed", { runnerRepo: repo })
    return null
  }
  return { repo, installationId: sharedInstallation }
}

// Creating the label is the trigger; it carries a one-time nonce and nothing else that grants access.
// ponytail: quota is count-then-insert, so concurrent pushes can overshoot it by a few.
export async function dispatchRunner(
  installationId: number,
  org: string,
  repo: string,
  sha: string,
  kind: RunnerKind,
  origin: string,
  request?: DetonationRequest,
): Promise<DispatchResult> {
  const target = await runnerTarget()
  if (!target) return { status: "detonation-unavailable" }
  if ((await runnerJobsThisMonth(org, target.repo)) >= SHARED_RUNNER_MONTHLY_QUOTA) {
    logger.info("runner_quota_reached", { org, repo, quota: SHARED_RUNNER_MONTHLY_QUOTA })
    const line = `${SHARED_RUNNER_MONTHLY_QUOTA} detonations this month; further pushes are not detonated until next month.`
    await fileFindingOnce(installationId, repo, toFinding(QUOTA_REACHED, repo, [], [line], { prose: true }), `Detonation paused for \`${org}\`.`)
    return { status: "detonation-unavailable" }
  }
  const nonce = mintRunnerToken()
  const label = runnerLabel(nonce, kind, new URL("/api/runner", origin).toString())
  if (!label) {
    logger.error("runner_label_too_long", { org, origin })
    return { status: "detonation-unavailable" }
  }
  const script = request?.checkScript ? await publishedCheckScript(request.checkScript) : null
  const id = await createRunnerJob(
    {
      installationId,
      org,
      repo,
      sha,
      kind,
      runnerRepo: target.repo,
      runnerInstallationId: target.installationId,
      label: seal(label.name),
      ...(request ? { phases: request.phases } : {}),
      ...(script ? { checkScriptId: script.id, checkScriptVersion: script.version } : {}),
    },
    nonce,
  )
  if (!(await createRunnerLabel(target.installationId, target.repo, label.name, label.description))) {
    await failRunnerJob(id, "The runner repository does not exist or the App cannot create labels on it.")
    logger.warn("runner_unavailable", { jobId: id, org, repo, runnerRepo: target.repo })
    return { status: "detonation-unavailable" }
  }
  logger.info("runner_dispatched", { jobId: id, org, repo, sha, kind })
  return { status: "dispatched", jobId: id }
}
