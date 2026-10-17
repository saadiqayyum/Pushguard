import { activeInstallation, addInstallationRepos, enqueueJob, hit, noteRepo, noteTagPush, recordPushActor } from "@/lib/db"
import { WEBHOOK_PUSH_WINDOW_SECONDS, WEBHOOK_PUSHES_PER_MINUTE } from "@/lib/jobs/limits"
import { logger } from "@/lib/logger"
import { notePullRequest, shouldEvaluatePullRequest } from "@/lib/pull-requests"
import { pullRequestPayloadSchema, pushPayloadSchema } from "@/schemas/webhook"

// First-push is recorded here, not in the job: a retried job would see the
// sender as known and lose the signal.
export async function handlePush(raw: string, deliveryId: string): Promise<number> {
  const payload = pushPayloadSchema.parse(JSON.parse(raw))
  if (payload.sender.type === "Bot") return 204

  const org = payload.repository.owner.login
  const repo = payload.repository.full_name
  const installation = await activeInstallation(org)
  if (!installation) {
    logger.warn("push_from_unregistered_org", { org, repo })
    return 204
  }

  if (installation.repos && !installation.repos.includes(repo)) await addInstallationRepos(org, [repo])
  const senderFirstPush = payload.deleted ? false : await recordPushActor(repo, payload.sender.login)
  const branch = payload.ref.startsWith("refs/heads/") ? payload.ref.slice("refs/heads/".length) : null
  if (payload.ref.startsWith("refs/tags/")) {
    await noteTagPush(repo, payload.ref.slice("refs/tags/".length), payload.deleted ? null : payload.after)
  }
  await noteRepo(repo, {
    defaultBranch: payload.repository.default_branch,
    ...(branch ? (payload.deleted ? { removeBranch: branch } : { addBranch: branch }) : {}),
  })

  const { count } = await hit(`webhook:${org}`, WEBHOOK_PUSH_WINDOW_SECONDS)
  await enqueueJob({
    type: "push",
    deliveryId,
    payload,
    senderFirstPush,
    flood: count === WEBHOOK_PUSHES_PER_MINUTE + 1,
  })
  return 202
}

export async function handlePullRequest(raw: string, deliveryId: string): Promise<number> {
  const payload = pullRequestPayloadSchema.parse(JSON.parse(raw))
  if (!(await activeInstallation(payload.repository.owner.login))) return 204

  await notePullRequest(payload)
  logger.info("pull_request_noted", {
    repo: payload.repository.full_name,
    number: payload.number,
    action: payload.action,
  })

  if (payload.sender.type === "Bot" || !shouldEvaluatePullRequest(payload.action)) return 204
  await enqueueJob({ type: "pull_request", deliveryId, payload })
  return 202
}
