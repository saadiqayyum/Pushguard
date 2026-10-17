import { enqueueJob, type InstallationDoc } from "@/lib/db"
import { EMPTY_SHA } from "@/lib/change-event"
import type { PushContext } from "@/lib/engine"
import { queueRepositoryRules } from "@/lib/review-session"
import { MAX_JOB_PATHS } from "@/schemas/job"
import type { PushPayload } from "@/schemas/webhook"

// What a default-branch push leaves for later jobs: tag posture, the index, repository rules.
export async function queueFollowUps(installation: InstallationDoc, payload: PushPayload, context: PushContext): Promise<void> {
  const touched = context.files.filter((f) => f.changeType !== "removed").map((f) => f.path)
  const gone = context.files.filter((f) => f.changeType === "removed").map((f) => f.path)
  if (touched.length === 0 && gone.length === 0) return
  if (touched.some((path) => path === "action.yml" || path === "action.yaml")) {
    await enqueueJob({ type: "tag_posture", repo: context.repo })
  }

  const whole = touched.length > MAX_JOB_PATHS || gone.length > MAX_JOB_PATHS
  await enqueueJob({
    type: "index",
    repo: context.repo,
    installationId: installation.installationId,
    ref: payload.after,
    reason: "push",
    ...(whole ? {} : { paths: touched, removed: gone }),
  })
  await queueRepositoryRules(
    installation,
    context.repo,
    context.branch,
    payload.after,
    context.files,
    payload.before === EMPTY_SHA ? undefined : payload.before,
    context,
  )
}
