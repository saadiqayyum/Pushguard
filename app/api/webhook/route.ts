import { NextResponse } from "next/server"
import { verify } from "@octokit/webhooks-methods"
import { asSystem, claimDelivery, enqueueJob, hit, releaseDelivery } from "@/lib/db"
import { RECONCILE_WINDOW_SECONDS } from "@/lib/jobs/limits"
import { env } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { withErrorHandler } from "@/lib/route"
import { handlePullRequest, handlePush } from "@/lib/webhook/change"
import {
  handleInstallation,
  handleInstallationRepos,
  handleMember,
  handleMembership,
  handleOrganization,
  handleTeam,
} from "@/lib/webhook/installation"
import { handleIssue, handlePublic, handleRef, handleRepository } from "@/lib/webhook/repository"
import { handleSettingsEvent } from "@/lib/webhook/settings"
import { handleSecurityAdvisory } from "@/lib/webhook/advisory"
import { handleDependabotAlert } from "@/lib/webhook/dependabot"
import { handleRelease, handleWorkflowRun, queueTagSnapshot } from "@/lib/webhook/actions"

export const maxDuration = 60

const PAYLOAD_MAX_BYTES = 1_000_000
const DELIVERY_ID_MAX_CHARS = 100

// Verify, deduplicate on the delivery id, update projections, enqueue the rest.
export const POST = withErrorHandler("/api/webhook", async (request) => {
  const raw = await request.text()
  if (raw.length > PAYLOAD_MAX_BYTES) throw new AppError("payload_too_large", "Payload exceeds 1 MB")

  const signature = request.headers.get("x-hub-signature-256")
  if (!signature || !(await verify(env().GITHUB_WEBHOOK_SECRET, raw, signature))) {
    throw new AppError("invalid_signature", "Signature verification failed")
  }

  const event = request.headers.get("x-github-event") ?? ""
  const deliveryId = (request.headers.get("x-github-delivery") ?? "").slice(0, DELIVERY_ID_MAX_CHARS)
  const status = await asSystem(async () => {
    if (deliveryId && !(await claimDelivery(deliveryId, event))) return 204
    if ((await hit("reconcile-deliveries", RECONCILE_WINDOW_SECONDS)).count === 1) {
      await enqueueJob({ type: "reconcile_deliveries" })
    }
    try {
      const handled = await route(event, raw, deliveryId)
      await queueTagSnapshot(raw)
      return handled
    } catch (error) {
      if (deliveryId) await releaseDelivery(deliveryId)
      throw error
    }
  })
  return new NextResponse(null, { status })
})

function route(event: string, raw: string, deliveryId: string): Promise<number> {
  switch (event) {
    case "installation":
      return handleInstallation(raw)
    case "installation_repositories":
      return handleInstallationRepos(raw)
    case "team":
      return handleTeam(raw)
    case "create":
    case "delete":
      return handleRef(raw, event)
    case "repository":
      return handleRepository(raw)
    case "member":
      return handleMember(raw)
    case "membership":
      return handleMembership(raw)
    case "organization":
      return handleOrganization(raw)
    case "issues":
    case "issue_comment":
      return handleIssue(raw, event)
    case "public":
      return handlePublic(raw)
    case "push":
      return handlePush(raw, deliveryId)
    case "pull_request":
      return handlePullRequest(raw, deliveryId)
    case "deploy_key":
    case "branch_protection_rule":
    case "repository_ruleset":
      return handleSettingsEvent(raw, event)
    case "security_advisory":
      return handleSecurityAdvisory(raw)
    case "dependabot_alert":
      return handleDependabotAlert(raw)
    case "workflow_run":
      return handleWorkflowRun(raw)
    case "release":
      return handleRelease(raw)
    default:
      return Promise.resolve(204)
  }
}
