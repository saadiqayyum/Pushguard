import { NextResponse, after } from "next/server"
import { assigneesFor } from "@/lib/alerts"
import { createAlertIssue } from "@/lib/github"
import {
  revokeOrgAccess,
  syncManyRepos,
  syncRepoAccess,
  syncTeamMember,
  syncTeamRepo,
} from "@/lib/access"
import { processMatches } from "@/lib/alerts"
import {
  activeInstallation,
  installationsCollection,
  forgetAlert,
  noteAlertActivity,
  noteRepo,
  removeAlertComment,
  upsertAlertComment,
  recordAlert,
  purgeOrgProjections,
  purgeRepoProjections,
  recordPushActor,
  reposCollection,
} from "@/lib/db"
import { evaluateRules, type PushContext } from "@/lib/engine"
import { env } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { getActiveRules, seedDefaultRules } from "@/lib/rules"
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
  refPayloadSchema,
  repositoryPayloadSchema,
  teamRepoPayloadSchema,
  teamPayloadSchema,
  type PushPayload,
} from "@/schemas/webhook"

export const maxDuration = 60

const PAYLOAD_MAX_BYTES = 1_000_000

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
    await (await installationsCollection()).updateOne(
      { org },
      {
        $set: {
          installationId: payload.installation.id,
          active: true,
          accountType: accountType(payload.installation.account.type),
          updatedAt: now,
          // Absent only when GitHub omits the list; the tenant backfill covers that.
          ...(repos ? { repos } : {}),
        },
        $setOnInsert: {
          _id: crypto.randomUUID(),
          // Default to whoever installed the app: an alert nobody is told about
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
    // Access for every repository the installation covers, read once, in the
    // background: from here on it is maintained by the member, membership, team
    // and organization events.
    if (repos?.length) {
      after(() => syncManyRepos(payload.installation.id, repos))
    }

    // A fresh account with zero rules detects nothing, so ship a working set.
    // Keyed by the installer: their next org install reuses the same rules.
    await seedDefaultRules(payload.sender.login, payload.sender.login)
  } else if (payload.action === "deleted" || payload.action === "suspend") {
    await (await installationsCollection()).updateOne({ org }, { $set: { active: false, updatedAt: now } })
    // Nothing will maintain these projections any more, and a stale access
    // record is worse than none: it would answer "yes" long after the answer
    // became unknowable. Scans, rules and filed alerts are the account's own
    // history and are deliberately kept.
    await purgeOrgProjections(org)
    logger.info("installation_deactivated", { org, purged: true })
  }
  return new NextResponse(null, { status: 204 })
}

async function handleInstallationRepos(raw: string): Promise<Response> {
  const payload = installationReposPayloadSchema.parse(JSON.parse(raw))
  const org = payload.installation.account.login
  const added = payload.repositories_added.map((r) => r.full_name)
  const removed = payload.repositories_removed.map((r) => r.full_name)
  const collection = await installationsCollection()

  // $addToSet and $pull cannot touch the same field in one update.
  if (added.length > 0) {
    await collection.updateOne({ org }, { $addToSet: { repos: { $each: added } }, $set: { updatedAt: new Date() } })
  }
  if (removed.length > 0) {
    await collection.updateOne({ org }, { $pull: { repos: { $in: removed } }, $set: { updatedAt: new Date() } })
    // The app can no longer see these, so anything we recorded about them is
    // now an assertion we cannot check.
    await purgeRepoProjections(removed)
  }
  // New repositories arrive with nobody recorded against them, so their access
  // is read once here rather than on the first request that needs it.
  const installation = await activeInstallation(org)
  if (installation && added.length > 0) {
    after(() => syncManyRepos(installation.installationId, added))
  }
  logger.info("installation_repos_updated", { org, added: added.length, removed: removed.length })
  return new NextResponse(null, { status: 204 })
}

async function handleTeam(raw: string): Promise<Response> {
  // A team gaining or losing a repository changes what every member of it can
  // read, so it is handled before the slug bookkeeping below.
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
  const collection = await installationsCollection()

  if (payload.action === "deleted") {
    await collection.updateOne({ org }, { $pull: { teams: slug } })
  } else {
    // created / edited. A rename arrives as `edited` with the old slug in
    // `changes`, so drop that one before adding the current name.
    const previous = payload.changes?.slug?.from
    if (previous) await collection.updateOne({ org }, { $pull: { teams: `${org}/${previous}` } })
    await collection.updateOne({ org }, { $addToSet: { teams: slug } })
  }
  logger.info("installation_team_updated", { org, team: slug, action: payload.action })
  return new NextResponse(null, { status: 204 })
}

/**
 * A repository went from private to public.
 *
 * The only event this app treats as an incident on its own, with no rule
 * involved. Every other detection is a heuristic that a rule can tune or
 * disable; this one is not a judgement call. The code was private, someone
 * made it public, and everyone can read it now. GitHub sends no inverse event,
 * so there is nothing to wait for and nothing to correlate.
 *
 * Filed into the repository itself when no alerts repo is configured. That is
 * normally refused for public repositories because an alert body quotes the
 * offending lines, here there are none to quote, only the fact and the account
 * that caused it.
 */
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

/**
 * Issue activity on an alert we filed.
 *
 * Two jobs. It mirrors open/closed so the feed can be served without asking
 * GitHub, and it records the first time a human touched the issue. Which is
 * what separates "three criticals" from "three criticals nobody has opened".
 *
 * Our own app's writes are excluded: filing an alert must not mark it as read.
 */
async function handleIssue(raw: string, event: "issues" | "issue_comment"): Promise<Response> {
  const payload = issuePayloadSchema.parse(JSON.parse(raw))
  const repo = payload.repository.full_name
  const { number } = payload.issue
  const { action } = payload

  // Deleting or transferring leaves the row pointing at nothing, and an
  // `unlabeled` that removed our own label means it is no longer ours to track.
  // These are checked before the label filter, because by the time they arrive
  // the label may already be gone.
  if (event === "issues" && (action === "deleted" || action === "transferred")) {
    await forgetAlert(repo, number)
    logger.info("alert_forgotten", { repo, issue: number, action })
    return new NextResponse(null, { status: 204 })
  }

  // Only our own alerts carry this label, so everything else in the repository
  // is somebody else's issue traffic and none of our business.
  if (!payload.issue.labels.some((label) => label.name === "pushguard")) {
    if (event === "issues" && action === "unlabeled") await forgetAlert(repo, number)
    return new NextResponse(null, { status: 204 })
  }

  // A Bot sender is this app closing or annotating its own ticket.
  const human = payload.sender.type === "Bot" ? null : payload.sender.login

  // `opened` is us filing it, which is not somebody having looked at it.
  // Everything else a person does to the issue counts as having looked.
  const touched = event === "issues" && action === "opened" ? null : human

  // Mirror the conversation itself, not just the fact of it.
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
    // Assignment is the useful triage state: an alert with nobody on it is the
    // one worth surfacing, whether or not somebody once glanced at it.
    ...(action === "assigned" || action === "unassigned"
      ? { assignees: payload.issue.assignees.map((user) => user.login) }
      : {}),
    ...(action === "edited" && payload.issue.title ? { title: payload.issue.title } : {}),
  })

  logger.info("alert_activity", { repo, issue: number, action, by: touched ?? "app" })
  return new NextResponse(null, { status: 204 })
}

/**
 * Access-changing events.
 *
 * Each one re-reads the smallest slice it can and answers 204 immediately, * the GitHub calls happen in `after()`, because a webhook that blocks on them
 * gets retried and duplicated rather than thanked.
 */
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

  // Leaving is the one access change needing no GitHub call: every grant in
  // that org goes, whatever produced it.
  if ((payload.action === "member_removed" || payload.action === "member_invited") && login) {
    if (payload.action === "member_removed") await revokeOrgAccess(org, login)
    logger.info("org_membership_changed", { org, login, action: payload.action })
    return new NextResponse(null, { status: 204 })
  }

  // Joining grants nothing on its own, access arrives with a team or a repo
  // event. So there is nothing to write, only to record.
  if (payload.action === "member_added" && login) {
    logger.info("org_member_added", { org, login })
    return new NextResponse(null, { status: 204 })
  }

  // The org is gone or is now called something else. Every projection is keyed
  // by the old name and can no longer be maintained under it.
  if (payload.action === "deleted" || payload.action === "renamed") {
    const previous = payload.changes?.login?.from ?? org
    await purgeOrgProjections(previous)
    await (await installationsCollection()).updateOne(
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
  const repos = await reposCollection()

  if (payload.action === "deleted") {
    await purgeRepoProjections([fullName])
    logger.info("repo_deleted", { repo: fullName })
    return new NextResponse(null, { status: 204 })
  }

  // With `repository_selection: all` GitHub does not send an
  // installation_repositories event for a newly created repository, so this is
  // the only notice we get that it is now in scope.
  if (payload.action === "created" || payload.action === "unarchived") {
    const installation = await activeInstallation(payload.repository.owner.login)
    if (installation) {
      await repos.updateOne(
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
      await (await installationsCollection()).updateOne(
        { org: payload.repository.owner.login },
        { $addToSet: { repos: fullName }, $set: { updatedAt: new Date() } },
      )
      after(() => syncManyRepos(installation.installationId, [fullName]))
    }
    logger.info("repo_created", { repo: fullName })
    return new NextResponse(null, { status: 204 })
  }

  // A rename leaves the old record orphaned under a name GitHub will never
  // mention again, so move it rather than writing a second one.
  const previousName = payload.changes?.repository?.name?.from
  if (payload.action === "renamed" && previousName) {
    const oldId = `${payload.repository.owner.login}/${previousName}`
    const existing = await repos.findOne({ _id: oldId })
    if (existing) {
      await repos.deleteOne({ _id: oldId })
      await repos.insertOne({ ...existing, _id: fullName, updatedAt: new Date() })
      logger.info("repo_renamed", { from: oldId, to: fullName })
      return new NextResponse(null, { status: 204 })
    }
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

  // Self-heal: a push proves the app is on this repo, so no installation_repositories
  // event can be missed badly enough to leave the picker stale.
  if (installation.repos && !installation.repos.includes(payload.repository.full_name)) {
    await (await installationsCollection()).updateOne(
      { org },
      { $addToSet: { repos: payload.repository.full_name } },
    )
  }

  // Recorded before the rules run, and only on real pushes: a branch deletion
  // carries no commits and should not make someone's next real push look
  // routine.
  const senderFirstPush = payload.deleted
    ? false
    : await recordPushActor(payload.repository.full_name, payload.sender.login)

  // Every push carries the repository's current default branch and the ref it
  // touched, so the stored record self-heals even if a create/delete event was
  // missed or predates the subscription.
  const branch = payload.ref.replace("refs/heads/", "")
  await noteRepo(payload.repository.full_name, {
    defaultBranch: payload.repository.default_branch,
    ...(payload.deleted ? { removeBranch: branch } : { addBranch: branch }),
  })

  const context = toContext(payload, senderFirstPush)
  // One rule set per account covers every org it installed on.
  const rules = await getActiveRules(installation.installedBy)
  const matches = evaluateRules(rules, context)

  logger.info("push_evaluated", {
    deliveryId,
    repo: context.repo,
    branch: context.branch,
    sender: payload.sender.login,
    rules: rules.length,
    matches: matches.map((m) => m.rule.id),
  })

  if (matches.length === 0) return new NextResponse(null, { status: 204 })

  after(async () => {
    try {
      await processMatches(installation, payload, matches)
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

function toContext(payload: PushPayload, senderFirstPush: boolean): PushContext {
  const files = new Map<string, "added" | "modified" | "removed">()
  for (const commit of payload.commits) {
    for (const path of commit.added) files.set(path, "added")
    for (const path of commit.modified) if (!files.has(path)) files.set(path, "modified")
    for (const path of commit.removed) files.set(path, "removed")
  }
  return {
    repo: payload.repository.full_name,
    branch: payload.ref.replace("refs/heads/", ""),
    forced: payload.forced,
    senderFirstPush,
    branchCreated: payload.created,
    branchDeleted: payload.deleted,
    hourUtc: new Date().getUTCHours(),
    files: [...files.entries()].map(([path, changeType]) => ({ path, changeType })),
  }
}
