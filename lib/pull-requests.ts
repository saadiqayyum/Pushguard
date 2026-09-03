import { runAiRules } from "@/lib/ai-rules"
import { processMatches } from "@/lib/alerts"
import { fromPullRequest } from "@/lib/change-event"
import {
  MAX_OPEN_PULL_REQUESTS_PER_REPO,
  removePullRequest,
  replaceRepoPullRequests,
  upsertPullRequest,
  type InstallationDoc,
} from "@/lib/db"
import { evaluateRules, type ChangedFile, type PushContext } from "@/lib/engine"
import { fetchCompareFiles, listOpenPullRequests } from "@/lib/github"
import { logger } from "@/lib/logger"
import { queueRepositoryRules } from "@/lib/review-session"
import { getActiveRules } from "@/lib/rules"
import type { PullRequestPayload } from "@/schemas/webhook"

// Keeps the open-pull-request projection current and runs rules on PR events.

export async function syncRepoPullRequests(installationId: number, repo: string): Promise<void> {
  const open = await listOpenPullRequests(installationId, repo, MAX_OPEN_PULL_REQUESTS_PER_REPO)
  await replaceRepoPullRequests(repo, open.map((pr) => ({ ...pr, repo })))
  logger.info("repo_pull_requests_synced", { repo, open: open.length })
}

const CLOSING_ACTIONS = new Set(["closed"])
const EVALUATED_ACTIONS = new Set(["opened", "reopened", "synchronize", "ready_for_review"])

export async function notePullRequest(payload: PullRequestPayload): Promise<void> {
  const repo = payload.repository.full_name
  if (CLOSING_ACTIONS.has(payload.action)) {
    await removePullRequest(repo, payload.number)
    return
  }
  const { pull_request: pr } = payload
  await upsertPullRequest({
    repo,
    number: payload.number,
    title: pr.title,
    author: pr.user.login,
    headRef: pr.head.ref,
    headSha: pr.head.sha,
    baseRef: pr.base.ref,
    draft: pr.draft,
    url: pr.html_url,
    openedAt: pr.created_at ? new Date(pr.created_at) : new Date(),
    updatedAt: pr.updated_at ? new Date(pr.updated_at) : new Date(),
  })
}

export function shouldEvaluatePullRequest(action: string): boolean {
  return EVALUATED_ACTIONS.has(action)
}

const STATUS_TO_CHANGE: Record<string, ChangedFile["changeType"]> = {
  added: "added",
  removed: "removed",
  renamed: "added",
  copied: "added",
}

// The pull request's whole diff against its base, not the last push to it.
// Every synchronize re-reads it, and the alert threads instead of repeating.
export async function evaluatePullRequest(
  installation: InstallationDoc,
  payload: PullRequestPayload,
  deliveryId: string | null,
): Promise<void> {
  const repo = payload.repository.full_name
  const { pull_request: pr } = payload
  const rules = await getActiveRules(installation.installedBy)

  const compared = await fetchCompareFiles(installation.installationId, repo, pr.base.sha, pr.head.sha)
  const files: ChangedFile[] = compared.files.map((file) => ({
    path: file.path,
    changeType: STATUS_TO_CHANGE[file.status] ?? "modified",
  }))

  const context: PushContext = {
    event: "pull_request",
    repo,
    branch: pr.base.ref,
    forced: false,
    senderFirstPush: false,
    branchCreated: false,
    branchDeleted: false,
    authorMismatch: false,
    unreviewed: false,
    hourUtc: new Date().getUTCHours(),
    files,
    commitMessages: [],
    pullRequest: { number: payload.number, head: pr.head.ref, draft: pr.draft, opened: payload.action === "opened" },
  }
  const matches = evaluateRules(rules, context)
  const aiFindings = await runAiRules(installation, repo, pr.base.ref, pr.head.sha, files, context)

  logger.info("pull_request_evaluated", {
    deliveryId,
    repo,
    number: payload.number,
    action: payload.action,
    files: files.length,
    matches: matches.map((m) => m.rule.id),
    aiFindings: aiFindings.length,
  })

  await queueRepositoryRules(
    installation,
    repo,
    pr.head.ref,
    pr.head.sha,
    files,
    pr.base.sha,
    context,
    { number: payload.number, base: pr.base.ref, url: pr.html_url },
  )
  if (matches.length === 0 && aiFindings.length === 0) return
  await processMatches(installation, fromPullRequest(payload, files), matches, null, aiFindings)
}
