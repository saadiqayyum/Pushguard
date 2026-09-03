import { NextResponse, after } from "next/server"
import { assigneesFor } from "@/lib/alerts"
import { commitReachedViaPullRequest, createAlertIssue } from "@/lib/github"
import {
  revokeOrgAccess,
  syncManyRepos,
  syncRepoAccess,
  syncTeamMember,
  syncTeamRepo,
} from "@/lib/access"
import { processMatches } from "@/lib/alerts"
import { changedFilesOf, fromPush } from "@/lib/change-event"
import { evaluatePullRequest, notePullRequest, shouldEvaluatePullRequest } from "@/lib/pull-requests"
import { db, activeInstallation, forgetAlert, noteAlertActivity, noteRepo, removeAlertComment, upsertAlertComment, recordAlert, purgeOrgProjections, purgeRepoProjections, recordPushActor, renameRepoProjections } from "@/lib/db"
import { evaluateRules, needsReviewCheck, type PushContext } from "@/lib/engine"
import { runAiRules } from "@/lib/ai-rules"
import { drainReviewSessions, queueRepositoryRules } from "@/lib/review-session"
import { drainIndexJobs, enqueueIndex, forgetIndex } from "@/lib/code-index"
import { inspectForcePush } from "@/lib/forensics"
import { env } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { getActiveRules } from "@/lib/rules"
import { withErrorHandler } from "@/lib/route"
import { verify } from "@octokit/webhooks-methods"
import {
  installationPayloadSchema,
  issuePayloadSchema,
  installationReposPayloadSchema,
  pushPayloadSchema,
  memberPayloadSchema,
  membershipPayloadSchema,
  organizationPayloadSchema,
  publicPayloadSchema,
  pullRequestPayloadSchema,
  refPayloadSchema,
  repositoryPayloadSchema,
  teamRepoPayloadSchema,
  teamPayloadSchema,
  type PushPayload,
} from "@/schemas/webhook"

export const maxDuration = 60

const PAYLOAD_MAX_BYTES = 1_000_000
const EMPTY_SHA = "0".repeat(40)

export const POST = withErrorHandler("/api/webhook", async (request) => {
  const raw = await request.text()
  if (raw.length > PAYLOAD_MAX_BYTES) throw new AppError("payload_too_large", "Payload exceeds 1 MB")

  const signature = request.headers.get("x-hub-signature-256")
  if (!signature || !(await verify(env().GITHUB_WEBHOOK_SECRET, raw, signature))) {
    throw new AppError("invalid_signature", "Signature verification failed")
  }

  const event = request.headers.get("x-github-event")
  if (event === "installation") return handleInstallation(raw)
  if (event === "installation_repositories") return handleInstallationRepos(raw)
  if (event === "team") return handleTeam(raw)
  if (event === "create" || event === "delete") return handleRef(raw, event)
  if (event === "repository") return handleRepository(raw)
  if (event === "member") return handleMember(raw)
  if (event === "membership") return handleMembership(raw)
  if (event === "organization") return handleOrganization(raw)
  if (event === "issues" || event === "issue_comment") return handleIssue(raw, event)
  if (event === "public") return handlePublic(raw)
  if (event === "push") return handlePush(raw, request.headers.get("x-github-delivery"))
  if (event === "pull_request") return handlePullRequest(raw, request.headers.get("x-github-delivery"))
  return new NextResponse(null, { status: 204 })
})

function accountType(type: string): "User" | "Organization" {
  return type === "Organization" ? "Organization" : "User"
}

async function handleInstallation(raw: string): Promise<Response> {
  const payload = installationPayloadSchema.parse(JSON.parse(raw))
  const org = payload.installation.account.login
  const now = new Date()

  if (payload.action === "created" || payload.action === "unsuspend") {
    const repos = payload.repositories?.map((r) => r.full_name)
    await db.installations().updateOne(
      { org },
      {
        $set: {
          installationId: payload.installation.id,
          active: true,
          accountType: accountType(payload.installation.account.type),
          updatedAt: now,
          ...(repos ? { repos } : {}),
        },
        $setOnInsert: {
          _id: crypto.randomUUID(),
          alertMention: `@${payload.sender.login}`,
          installedBy: payload.sender.login,
          createdAt: now,
        },
      },
      { upsert: true },
    )
    logger.info("installation_registered", {
      org,
      installationId: payload.installation.id,
      repos: repos?.length ?? 0,
    })
    if (repos?.length) {
      after(() => syncManyRepos(payload.installation.id, repos))
      after(async () => {
        for (const repo of repos) {
          await enqueueIndex({
            repo,
            installationId: payload.installation.id,
            ref: "HEAD",
            reason: "install",
          })
        }
      })
    }

  } else if (payload.action === "deleted" || payload.action === "suspend") {
    const covered = (await activeInstallation(org))?.repos ?? []
    await db.installations().updateOne({ org }, { $set: { active: false, updatedAt: now } })
    await purgeOrgProjections(org)
    await forgetIndex(covered)
    logger.info("installation_deactivated", { org, purged: true })
  }
  return new NextResponse(null, { status: 204 })
}

async function handleInstallationRepos(raw: string): Promise<Response> {
  const payload = installationReposPayloadSchema.parse(JSON.parse(raw))
  const org = payload.installation.account.login
  const added = payload.repositories_added.map((r) => r.full_name)
  const removed = payload.repositories_removed.map((r) => r.full_name)
  const collection = db.installations()

  if (added.length > 0) {
    await collection.updateOne({ org }, { $addToSet: { repos: { $each: added } }, $set: { updatedAt: new Date() } })
  }
  if (removed.length > 0) {
    await collection.updateOne({ org }, { $pull: { repos: { $in: removed } }, $set: { updatedAt: new Date() } })
    await purgeRepoProjections(removed)
    await forgetIndex(removed)
  }
  const installation = await activeInstallation(org)
  if (installation && added.length > 0) {
    after(() => syncManyRepos(installation.installationId, added))
    after(async () => {
      for (const repo of added) {
        await enqueueIndex({
          repo,
          installationId: installation.installationId,
          ref: "HEAD",
          reason: "install",
        })
      }
    })
  }
  logger.info("installation_repos_updated", { org, added: added.length, removed: removed.length })
  return new NextResponse(null, { status: 204 })
}

async function handleTeam(raw: string): Promise<Response> {
  const repoChange = teamRepoPayloadSchema.safeParse(JSON.parse(raw))
  if (
    repoChange.success &&
    repoChange.data.repository &&
    (repoChange.data.action === "added_to_repository" || repoChange.data.action === "removed_from_repository")
  ) {
    const org = repoChange.data.organization.login
    const installation = await activeInstallation(org)
    if (installation) {
      const { slug } = repoChange.data.team
      const repo = repoChange.data.repository.full_name
      const action = repoChange.data.action === "added_to_repository" ? "granted" : "revoked"
      after(() =>
        syncTeamRepo(installation.installationId, org, slug, repo, action).catch((error: unknown) =>
          logger.error("team_repo_sync_failed", { org, repo, error: String(error) }),
        ),
      )
    }
    return new NextResponse(null, { status: 204 })
  }

  const payload = teamPayloadSchema.parse(JSON.parse(raw))
  const org = payload.organization.login
  const slug = `${org}/${payload.team.slug}`
  const collection = db.installations()

  if (payload.action === "deleted") {
    await collection.updateOne({ org }, { $pull: { teams: slug } })
  } else {
    const previous = payload.changes?.slug?.from
    if (previous) await collection.updateOne({ org }, { $pull: { teams: `${org}/${previous}` } })
    await collection.updateOne({ org }, { $addToSet: { teams: slug } })
  }
  logger.info("installation_team_updated", { org, team: slug, action: payload.action })
  return new NextResponse(null, { status: 204 })
}

// A repository went from private to public.
async function handlePublic(raw: string): Promise<Response> {
  const payload = publicPayloadSchema.parse(JSON.parse(raw))
  const repo = payload.repository.full_name
  const org = payload.repository.owner.login

  await noteRepo(repo, { private: false, defaultBranch: payload.repository.default_branch })

  const installation = await activeInstallation(org)
  if (!installation) return new NextResponse(null, { status: 204 })

  const target = repo
  const title = `[critical] ${repo}: repository made public`
  after(async () => {
    try {
      const issue = await createAlertIssue(
        installation.installationId,
        target,
        title,
        [
          installation.alertMention ? `${installation.alertMention}. A private repository is now public.` : "A private repository is now public.",
          "",
          "| | |",
          "|---|---|",
          `| Repository | ${repo} |`,
          `| Changed by | @${payload.sender.login} |`,
          `| At | ${new Date().toISOString()} |`,
          "",
          "Everything in this repository's history is now readable by anyone, including any",
          "credential ever committed to it. Making it private again does not un-publish what",
          "was fetched, forked or indexed in the meantime.",
          "",
          `[Repository settings](https://github.com/${repo}/settings)`,
        ].join("\n"),
        ["pushguard", "severity:critical", "visibility"],
        assigneesFor(installation.alertMention),
      )
      await recordAlert({
        repo: target,
        number: issue.number,
        url: issue.html_url,
        title,
        severity: "critical",
        ruleIds: ["repository-made-public"],
        findings: [],
        source: "push",
        createdAt: new Date(),
      })
      logger.info("visibility_alert_created", { repo, by: payload.sender.login, issue: issue.number })
    } catch (error) {
      logger.error("visibility_alert_failed", { repo, error: String(error) })
    }
  })

  return new NextResponse(null, { status: 204 })
}

// Issue activity on an alert we filed.
async function handleIssue(raw: string, event: "issues" | "issue_comment"): Promise<Response> {
  const payload = issuePayloadSchema.parse(JSON.parse(raw))
  const repo = payload.repository.full_name
  const { number } = payload.issue
  const { action } = payload

  if (event === "issues" && (action === "deleted" || action === "transferred")) {
    await forgetAlert(repo, number)
    logger.info("alert_forgotten", { repo, issue: number, action })
    return new NextResponse(null, { status: 204 })
  }

  if (!payload.issue.labels.some((label) => label.name === "pushguard")) {
    if (event === "issues" && action === "unlabeled") await forgetAlert(repo, number)
    return new NextResponse(null, { status: 204 })
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
    state:
      action === "closed" ? "closed" : action === "reopened" ? "open" : undefined,
    by: touched,
    ...(action === "assigned" || action === "unassigned"
      ? { assignees: payload.issue.assignees.map((user) => user.login) }
      : {}),
    ...(action === "edited" && payload.issue.title ? { title: payload.issue.title } : {}),
  })

  logger.info("alert_activity", { repo, issue: number, action, by: touched ?? "app" })
  return new NextResponse(null, { status: 204 })
}

// Access-changing events.
async function handleMember(raw: string): Promise<Response> {
  const payload = memberPayloadSchema.parse(JSON.parse(raw))
  const org = payload.repository.owner.login
  const installation = await activeInstallation(org)
  if (installation) {
    after(() =>
      syncRepoAccess(installation.installationId, payload.repository.full_name).catch((error: unknown) =>
        logger.error("member_sync_failed", { repo: payload.repository.full_name, error: String(error) }),
      ),
    )
  }
  logger.info("member_changed", { repo: payload.repository.full_name, action: payload.action })
  return new NextResponse(null, { status: 204 })
}

async function handleMembership(raw: string): Promise<Response> {
  const payload = membershipPayloadSchema.parse(JSON.parse(raw))
  const org = payload.organization.login
  const installation = await activeInstallation(org)
  if (installation) {
    const action = payload.action === "added" ? "added" : "removed"
    after(() =>
      syncTeamMember(installation.installationId, org, payload.team.slug, payload.member.login, action).catch(
        (error: unknown) => logger.error("membership_sync_failed", { org, error: String(error) }),
      ),
    )
  }
  return new NextResponse(null, { status: 204 })
}

async function handleOrganization(raw: string): Promise<Response> {
  const payload = organizationPayloadSchema.parse(JSON.parse(raw))
  const org = payload.organization.login
  const login = payload.membership?.user.login

  if ((payload.action === "member_removed" || payload.action === "member_invited") && login) {
    if (payload.action === "member_removed") await revokeOrgAccess(org, login)
    logger.info("org_membership_changed", { org, login, action: payload.action })
    return new NextResponse(null, { status: 204 })
  }

  if (payload.action === "member_added" && login) {
    logger.info("org_member_added", { org, login })
    return new NextResponse(null, { status: 204 })
  }

  if (payload.action === "deleted" || payload.action === "renamed") {
    const previous = payload.changes?.login?.from ?? org
    await purgeOrgProjections(previous)
    await db.installations().updateOne(
      { org: previous },
      { $set: { active: payload.action === "renamed", updatedAt: new Date() } },
    )
    logger.info("org_lifecycle", { org: previous, action: payload.action })
  }
  return new NextResponse(null, { status: 204 })
}

// Branch created or deleted. Tags are ignored: nothing scans one.
async function handleRef(raw: string, event: "create" | "delete"): Promise<Response> {
  const payload = refPayloadSchema.parse(JSON.parse(raw))
  if (payload.ref_type !== "branch") return new NextResponse(null, { status: 204 })

  await noteRepo(payload.repository.full_name, {
    defaultBranch: payload.repository.default_branch,
    ...(event === "create" ? { addBranch: payload.ref } : { removeBranch: payload.ref }),
  })
  logger.info("repo_branch_updated", { repo: payload.repository.full_name, ref: payload.ref, event })
  return new NextResponse(null, { status: 204 })
}

// The repository itself changed: renamed, archived, or its default branch moved.
async function handleRepository(raw: string): Promise<Response> {
  const payload = repositoryPayloadSchema.parse(JSON.parse(raw))
  const fullName = payload.repository.full_name

  if (payload.action === "deleted") {
    await purgeRepoProjections([fullName])
    await forgetIndex([fullName])
    logger.info("repo_deleted", { repo: fullName })
    return new NextResponse(null, { status: 204 })
  }

  if (payload.action === "created" || payload.action === "unarchived") {
    const installation = await activeInstallation(payload.repository.owner.login)
    if (installation) {
      await db.repos().updateOne(
        { _id: fullName },
        {
          $set: {
            org: payload.repository.owner.login,
            defaultBranch: payload.repository.default_branch ?? "main",
            archived: false,
            updatedAt: new Date(),
          },
          $setOnInsert: { branches: [], branchesTruncated: false },
        },
        { upsert: true },
      )
      await db.installations().updateOne(
        { org: payload.repository.owner.login },
        { $addToSet: { repos: fullName }, $set: { updatedAt: new Date() } },
      )
      after(() => syncManyRepos(installation.installationId, [fullName]))
      after(() =>
        enqueueIndex({
          repo: fullName,
          installationId: installation.installationId,
          ref: "HEAD",
          reason: "install",
        }),
      )
    }
    logger.info("repo_created", { repo: fullName })
    return new NextResponse(null, { status: 204 })
  }

  const previousName = payload.changes?.repository?.name?.from
  if (payload.action === "renamed" && previousName) {
    const oldId = `${payload.repository.owner.login}/${previousName}`
    await renameRepoProjections(oldId, fullName)
    await forgetIndex([oldId])
    logger.info("repo_renamed", { from: oldId, to: fullName })
    return new NextResponse(null, { status: 204 })
  }

  await noteRepo(fullName, {
    defaultBranch: payload.repository.default_branch,
    archived: payload.repository.archived,
  })
  logger.info("repo_updated", { repo: fullName, action: payload.action })
  return new NextResponse(null, { status: 204 })
}

async function handlePush(raw: string, deliveryId: string | null): Promise<Response> {
  const payload = pushPayloadSchema.parse(JSON.parse(raw))
  if (payload.sender.type === "Bot") return new NextResponse(null, { status: 204 })

  const org = payload.repository.owner.login
  const installation = await activeInstallation(org)
  if (!installation) {
    logger.warn("push_from_unregistered_org", { org, repo: payload.repository.full_name })
    return new NextResponse(null, { status: 204 })
  }

  if (installation.repos && !installation.repos.includes(payload.repository.full_name)) {
    await db.installations().updateOne(
      { org },
      { $addToSet: { repos: payload.repository.full_name } },
    )
  }

  const senderFirstPush = payload.deleted
    ? false
    : await recordPushActor(payload.repository.full_name, payload.sender.login)

  const branch = payload.ref.replace("refs/heads/", "")
  await noteRepo(payload.repository.full_name, {
    defaultBranch: payload.repository.default_branch,
    ...(payload.deleted ? { removeBranch: branch } : { addBranch: branch }),
  })

  const rules = await getActiveRules(installation.installedBy)

  const unreviewed =
    !payload.deleted && needsReviewCheck(rules, payload.repository.full_name, branch)
      ? await reviewState(installation.installationId, payload.repository.full_name, payload.after)
      : null

  const context = toContext(payload, senderFirstPush, unreviewed)
  const matches = evaluateRules(rules, context)

  if (!payload.deleted && branch === payload.repository.default_branch) {
    const touched = [
      ...new Set(context.files.filter((f) => f.changeType !== "removed").map((f) => f.path)),
    ]
    const gone = context.files.filter((f) => f.changeType === "removed").map((f) => f.path)
    if (touched.length > 0 || gone.length > 0) {
      const repoName = payload.repository.full_name
      after(async () => {
        try {
          await enqueueIndex({
            repo: repoName,
            installationId: installation.installationId,
            ref: payload.after,
            reason: "push",
            paths: touched,
            removed: gone,
          })
          await drainIndexJobs(1, repoName)
        } catch (error) {
          logger.warn("index_update_failed", { repo: repoName, error: String(error) })
        }
      })

      after(async () => {
        try {
          await queueRepositoryRules(
            installation,
            context.repo,
            context.branch,
            payload.after,
            context.files,
            payload.before === EMPTY_SHA ? undefined : payload.before,
            context,
          )
          await drainReviewSessions(1, repoName)
        } catch (error) {
          logger.warn("review_session_enqueue_failed", { repo: repoName, error: String(error) })
        }
      })
    }
  }

  logger.info("push_evaluated", {
    deliveryId,
    repo: context.repo,
    branch: context.branch,
    sender: payload.sender.login,
    rules: rules.length,
    matches: matches.map((m) => m.rule.id),
  })

  const inspectErasure = payload.forced && payload.before !== EMPTY_SHA && !payload.deleted
  if (matches.length === 0 && !inspectErasure && !payload.deleted) {
    after(async () => {
      try {
        const aiFindings = await runAiRules(
          installation,
          context.repo,
          context.branch,
          payload.after,
          context.files,
        )
        if (aiFindings.length > 0) {
          await processMatches(installation, fromPush(payload), [], null, aiFindings)
        }
      } catch (error) {
        logger.error("ai_rules_failed", {
          deliveryId,
          repo: context.repo,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })
    return new NextResponse(null, { status: 202 })
  }
  if (matches.length === 0 && !inspectErasure) return new NextResponse(null, { status: 204 })

  after(async () => {
    try {
      const forensics = inspectErasure
        ? await inspectForcePush(
            installation.installationId,
            context.repo,
            payload.before,
            payload.after,
            rules,
            context.branch,
          )
        : null
      const aiFindings = payload.deleted
        ? []
        : await runAiRules(
            installation,
            context.repo,
            context.branch,
            payload.after,
            context.files,
            context,
          )
      if (matches.length === 0 && !forensics && aiFindings.length === 0) return
      await processMatches(installation, fromPush(payload), matches, forensics, aiFindings)
    } catch (error) {
      logger.error("alert_processing_failed", {
        deliveryId,
        repo: context.repo,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  return new NextResponse(null, { status: 202 })
}

async function handlePullRequest(raw: string, deliveryId: string | null): Promise<Response> {
  const payload = pullRequestPayloadSchema.parse(JSON.parse(raw))
  const org = payload.repository.owner.login
  const installation = await activeInstallation(org)
  if (!installation) return new NextResponse(null, { status: 204 })

  await notePullRequest(payload)
  logger.info("pull_request_noted", { repo: payload.repository.full_name, number: payload.number, action: payload.action })

  if (payload.sender.type === "Bot" || !shouldEvaluatePullRequest(payload.action)) {
    return new NextResponse(null, { status: 204 })
  }
  after(async () => {
    try {
      await evaluatePullRequest(installation, payload, deliveryId)
    } catch (error) {
      logger.error("pull_request_evaluation_failed", {
        deliveryId,
        repo: payload.repository.full_name,
        number: payload.number,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
  return new NextResponse(null, { status: 202 })
}

// Null, not false, when GitHub could not answer. See commitReachedViaPullRequest.
async function reviewState(
  installationId: number,
  repo: string,
  sha: string,
): Promise<boolean | null> {
  const viaPr = await commitReachedViaPullRequest(installationId, repo, sha)
  return viaPr === null ? null : !viaPr
}

function toContext(
  payload: PushPayload,
  senderFirstPush: boolean,
  unreviewed: boolean | null,
): PushContext {
  return {
    event: "push",
    repo: payload.repository.full_name,
    branch: payload.ref.replace("refs/heads/", ""),
    forced: payload.forced,
    senderFirstPush,
    branchCreated: payload.created,
    branchDeleted: payload.deleted,
    authorMismatch: hasAuthorMismatch(payload),
    unreviewed,
    hourUtc: new Date().getUTCHours(),
    files: changedFilesOf(payload),
    commitMessages: payload.commits.map((commit) => commit.message).filter(Boolean),
  }
}

// A commit here names a GitHub account that is not the one that pushed.
function hasAuthorMismatch(payload: PushPayload): boolean {
  return payload.commits.some(
    (commit) => commit.author?.username && commit.author.username !== payload.sender.login,
  )
}
