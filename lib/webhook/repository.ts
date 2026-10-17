import {
  alertExists,
  alertPusher,
  activeInstallation,
  branchCreator,
  noteChainEvent,
  addInstallationRepos,
  dropIndex,
  enqueueJob,
  forgetAlert,
  noteAlertActivity,
  noteRepo,
  purgeRepoProjections,
  removeAlertComment,
  removeInstallationRepos,
  renameRepoProjections,
  upsertAlertComment,
} from "@/lib/db"
import { BRANCH_FLASH_SECONDS } from "@/lib/ci-limits"
import { ownerOf } from "@/lib/finding"
import { logger } from "@/lib/logger"
import { metaAlert } from "@/lib/meta-alerts"
import {
  issuePayloadSchema,
  publicPayloadSchema,
  refPayloadSchema,
  repositoryPayloadSchema,
} from "@/schemas/webhook"
import { queueRepoSync } from "./installation"

// A repository went from private to public. The issue is filed by a job.
export async function handlePublic(raw: string): Promise<number> {
  const payload = publicPayloadSchema.parse(JSON.parse(raw))
  const repo = payload.repository.full_name
  await noteRepo(repo, { private: false, defaultBranch: payload.repository.default_branch })
  if (await activeInstallation(payload.repository.owner.login)) {
    await enqueueJob({ type: "public_alert", repo, sender: payload.sender.login })
  }
  return 204
}

// Issue activity on an alert we filed.
export async function handleIssue(raw: string, event: "issues" | "issue_comment"): Promise<number> {
  const payload = issuePayloadSchema.parse(JSON.parse(raw))
  const repo = payload.repository.full_name
  const { number } = payload.issue
  const { action } = payload

  if (event === "issues" && (action === "deleted" || action === "transferred")) {
    if (await alertExists(repo, number)) {
      await metaAlert("alert_deleted", ownerOf(repo), [`${repo}#${number} was ${action} by @${payload.sender.login}.`])
    }
    await forgetAlert(repo, number)
    logger.info("alert_forgotten", { repo, issue: number, action })
    return 204
  }

  if (!payload.issue.labels.some((label) => label.name === "pushguard")) {
    if (event === "issues" && action === "unlabeled" && (await alertExists(repo, number))) {
      await metaAlert("alert_unlabeled", ownerOf(repo), [`${repo}#${number} unlabeled by @${payload.sender.login}.`])
      await forgetAlert(repo, number)
    }
    return 204
  }

  if (event === "issues" && action === "closed") {
    const pusher = await alertPusher(repo, number)
    if (pusher && pusher.toLowerCase() === payload.sender.login.toLowerCase()) {
      await metaAlert("alert_closed_by_actor", ownerOf(repo), [
        `${repo}#${number} was closed by @${payload.sender.login}, who made the push it reports.`,
        `https://github.com/${repo}/issues/${number}`,
      ])
    }
  }

  const human = payload.sender.type === "Bot" ? null : payload.sender.login
  const touched = event === "issues" && action === "opened" ? null : human

  if (event === "issue_comment" && payload.comment) {
    const { comment } = payload
    if (action === "deleted") {
      await removeAlertComment(repo, number, comment.id)
    } else {
      await upsertAlertComment(repo, number, {
        id: comment.id,
        by: comment.user.login,
        body: comment.body ?? "",
        at: comment.created_at ? new Date(comment.created_at) : new Date(),
      })
    }
  }

  await noteAlertActivity(repo, number, {
    action: event === "issue_comment" ? `comment ${action}` : action,
    state: action === "closed" ? "closed" : action === "reopened" ? "open" : undefined,
    by: touched,
    ...(action === "assigned" || action === "unassigned"
      ? { assignees: payload.issue.assignees.map((user) => user.login) }
      : {}),
    ...(action === "edited" && payload.issue.title ? { title: payload.issue.title } : {}),
  })

  logger.info("alert_activity", { repo, issue: number, action, by: touched ?? "app" })
  return 204
}

// Branch created or deleted. Tags are ignored: nothing scans one.
export async function handleRef(raw: string, event: "create" | "delete"): Promise<number> {
  const payload = refPayloadSchema.parse(JSON.parse(raw))
  if (payload.ref_type !== "branch") return 204

  await noteRepo(payload.repository.full_name, {
    defaultBranch: payload.repository.default_branch,
    ...(event === "create" ? { addBranch: payload.ref } : { removeBranch: payload.ref }),
  })
  await noteBranchFlash(payload.repository.full_name, payload.ref, event, payload.sender?.login ?? null)
  logger.info("repo_branch_updated", { repo: payload.repository.full_name, ref: payload.ref, event })
  return 204
}

// A branch created and deleted within seconds is how the tj-actions attacker
// ran a secret-stealing workflow without leaving it in the repository.
async function noteBranchFlash(repo: string, ref: string, event: "create" | "delete", login: string | null): Promise<void> {
  const org = ownerOf(repo)
  if (event === "create") {
    await noteChainEvent(org, { kind: "branch_created", repo, login, detail: ref })
    return
  }
  const creator = await branchCreator(org, repo, ref, BRANCH_FLASH_SECONDS)
  if (creator) await noteChainEvent(org, { kind: "branch_flash", repo, login: creator, detail: `${repo}:${ref}` })
}

// The repository itself changed: created, deleted, renamed, archived, or its default branch moved.
export async function handleRepository(raw: string): Promise<number> {
  const payload = repositoryPayloadSchema.parse(JSON.parse(raw))
  const fullName = payload.repository.full_name
  const org = payload.repository.owner.login

  if (payload.action === "deleted") {
    await removeInstallationRepos(org, [fullName])
    await purgeRepoProjections([fullName])
    await dropIndex([fullName])
    logger.info("repo_deleted", { repo: fullName })
    return 204
  }

  if (payload.action === "created" || payload.action === "unarchived") {
    const installation = await activeInstallation(org)
    if (installation) {
      await noteRepo(fullName, { defaultBranch: payload.repository.default_branch ?? "main", archived: false })
      await addInstallationRepos(org, [fullName])
      await queueRepoSync(installation.installationId, [fullName])
    }
    logger.info("repo_created", { repo: fullName })
    return 204
  }

  const previousName = payload.changes?.repository?.name?.from
  if (payload.action === "renamed" && previousName) {
    const oldName = `${org}/${previousName}`
    await renameRepoProjections(oldName, fullName)
    await removeInstallationRepos(org, [oldName])
    await addInstallationRepos(org, [fullName])
    await dropIndex([oldName])
    logger.info("repo_renamed", { from: oldName, to: fullName })
    return 204
  }

  await noteRepo(fullName, {
    defaultBranch: payload.repository.default_branch,
    archived: payload.repository.archived,
  })
  logger.info("repo_updated", { repo: fullName, action: payload.action })
  return 204
}
