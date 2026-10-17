import { asSystem } from "@/lib/db/client"
import { failRunnerJob, redeemFetchNonce } from "@/lib/db/runner-jobs"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { withErrorHandler } from "@/lib/route"
import { deleteRunnerLabel, repoTarball } from "@/lib/github"
import { checkDelivery, prepend } from "@/lib/runner/check-delivery"
import { TARBALL_MAX_BYTES } from "@/lib/runner/limits"
import { limitRunner, readBody } from "@/lib/runner/guard"
import { runnerLabelName } from "@/lib/runner/target"
import { runnerFetchSchema } from "@/schemas/runner"

export const maxDuration = 60

const FETCH_BODY_MAX_BYTES = 1_000

export const POST = withErrorHandler("/api/runner/fetch", async (request) =>
  asSystem(async () => {
    await limitRunner(request)
    const { nonce } = runnerFetchSchema.parse(await readBody(request, FETCH_BODY_MAX_BYTES))
    const redeemed = await redeemFetchNonce(nonce)
    if (!redeemed) throw new AppError("not_found", "Unknown or used nonce")
    const { job, reportToken } = redeemed
    if (job.runnerRepo && job.runnerInstallationId) await deleteRunnerLabel(job.runnerInstallationId, job.runnerRepo, runnerLabelName(nonce))
    const tarball = await repoTarball(job.installationId, job.repo, job.sha, TARBALL_MAX_BYTES).catch(async (error) => {
      await failRunnerJob(job.id, "The repository archive could not be fetched.")
      throw error
    })
    const check = await checkDelivery(job)
    logger.info("runner_fetched", { jobId: job.id, repo: job.repo, sha: job.sha, check: check.prefix !== null })
    return new Response(prepend(check.prefix, tarball), {
      headers: {
        ...check.headers,
        "content-type": "application/gzip",
        "cache-control": "no-store",
        "x-pushguard-report-token": reportToken,
        "x-pushguard-repo": job.repo,
      },
    })
  }),
)
