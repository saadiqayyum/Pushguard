import { NextResponse, after } from "next/server"
import { processMatches } from "@/lib/alerts"
import { activeInstallation, installationsCollection } from "@/lib/db"
import { evaluateRules, type PushContext } from "@/lib/engine"
import { env } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { getActiveRules, seedDefaultRules } from "@/lib/rules"
import { withErrorHandler } from "@/lib/route"
import { verify } from "@octokit/webhooks-methods"
import {
  installationPayloadSchema,
  installationReposPayloadSchema,
  pushPayloadSchema,
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
          alertsRepo: null,
          // Default to whoever installed the app: an alert nobody is told about
          // is not an alert. Changeable (including to none) in settings.
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
    // A fresh account with zero rules detects nothing, so ship a working set.
    // Keyed by the installer: their next org install reuses the same rules.
    await seedDefaultRules(payload.sender.login, payload.sender.login)
  } else if (payload.action === "deleted" || payload.action === "suspend") {
    await (await installationsCollection()).updateOne({ org }, { $set: { active: false, updatedAt: now } })
    logger.info("installation_deactivated", { org })
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
  }
  logger.info("installation_repos_updated", { org, added: added.length, removed: removed.length })
  return new NextResponse(null, { status: 204 })
}

async function handleTeam(raw: string): Promise<Response> {
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

  const context = toContext(payload)
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

function toContext(payload: PushPayload): PushContext {
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
    branchCreated: payload.created,
    branchDeleted: payload.deleted,
    hourUtc: new Date().getUTCHours(),
    files: [...files.entries()].map(([path, changeType]) => ({ path, changeType })),
  }
}
