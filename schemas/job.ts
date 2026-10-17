import { z } from "zod"
import { contributorInput } from "@/lib/contributor/input"
import { FOCUS_IDS } from "@/lib/rules/focus"
import { pullRequestPayloadSchema, pushPayloadSchema } from "./webhook"

const repoName = z.string().regex(/^[^/\s]+\/[^/\s]+$/).max(200)
const installationId = z.number().int().positive()
export const MAX_JOB_PATHS = 3_000
export const MAX_JOB_REPOS = 1_000
export const MAX_ADVISORY_PACKAGES = 100
export const MAX_ADVISORY_VERSIONS = 100
export const MAX_INVESTIGATION_CANDIDATES = 5

export const jobMessage = z.discriminatedUnion("type", [
  contributorInput.extend({ type: z.literal("contributor") }),
  z.object({
    type: z.literal("push"),
    deliveryId: z.string().max(100),
    payload: pushPayloadSchema,
    senderFirstPush: z.boolean(),
    flood: z.boolean(),
    reviewDeferred: z.boolean().optional(),
  }),
  z.object({ type: z.literal("ai_review"), repo: repoName, branch: z.string().max(255) }),
  z.object({ type: z.literal("pull_request"), deliveryId: z.string().max(100), payload: pullRequestPayloadSchema }),
  z.object({
    type: z.literal("index"),
    repo: repoName,
    installationId,
    ref: z.string().max(255),
    reason: z.enum(["install", "push"]),
    paths: z.array(z.string().max(1024)).max(MAX_JOB_PATHS).optional(),
    removed: z.array(z.string().max(1024)).max(MAX_JOB_PATHS).optional(),
  }),
  z.object({ type: z.literal("sync_repos"), installationId, repos: z.array(repoName).max(MAX_JOB_REPOS) }),
  z.object({ type: z.literal("sync_repo_access"), installationId, repo: repoName }),
  z.object({ type: z.literal("sync_org_members"), installationId, org: z.string().max(100) }),
  z.object({ type: z.literal("public_alert"), repo: repoName, sender: z.string().max(100) }),
  z.object({
    type: z.literal("sync_team_repo"),
    installationId,
    org: z.string().max(100),
    slug: z.string().max(100),
    repo: repoName,
    action: z.enum(["granted", "revoked"]),
  }),
  z.object({
    type: z.literal("sync_team_member"),
    installationId,
    org: z.string().max(100),
    slug: z.string().max(100),
    login: z.string().max(100),
    action: z.enum(["added", "removed"]),
  }),
  z.object({ type: z.literal("review_session"), id: z.string().uuid() }),
  z.object({
    type: z.literal("investigate"),
    installationId,
    repo: repoName,
    sha: z.string().regex(/^[0-9a-f]{40}$/i),
    target: repoName,
    issue: z.number().int().positive(),
    redact: z.boolean(),
    candidates: z
      .array(
        z.object({
          ruleId: z.string().max(100),
          severity: z.enum(["low", "medium", "high", "critical"]),
          files: z.array(z.string().max(1024)).max(20),
          lines: z.array(z.string().max(600)).max(5),
        }),
      )
      .min(1)
      .max(MAX_INVESTIGATION_CANDIDATES),
    focus: z.object({ promptId: z.enum(FOCUS_IDS), maxTokens: z.number().int().positive().max(32_000).optional() }).optional(),
  }),
  z.object({ type: z.literal("scan"), id: z.string().max(100) }),
  z.object({
    type: z.literal("file_scan"),
    id: z.string().max(100),
    by: z.string().max(100),
    repos: z.array(repoName).max(50).nullable(),
  }),
  z.object({ type: z.literal("runner_report"), jobId: z.string().uuid() }),
  z.object({
    type: z.literal("meta_alert"),
    kind: z.enum([
      "installation_deleted",
      "installation_suspend",
      "repo_removed",
      "alert_closed_by_actor",
      "alert_deleted",
      "alert_unlabeled",
      "org_ruleset_changed",
      "delivery_missed",
      "tag_repoint_chain",
      "rule_hit",
    ]),
    org: z.string().max(100),
    lines: z.array(z.string().max(300)).max(10),
  }),
  z.object({ type: z.literal("runner_deadline"), jobId: z.string().uuid() }),
  z.object({
    type: z.literal("malicious_packages"),
    source: z.enum(["ghsa", "osv", "intel"]),
    advisoryId: z.string().max(200),
    summary: z.string().max(1024),
    publishedAt: z.iso.datetime({ offset: true }).nullable(),
    withdrawnAt: z.iso.datetime({ offset: true }).nullable(),
    packages: z
      .array(
        z.object({
          ecosystem: z.string().max(50),
          name: z.string().max(214),
          versionRange: z.string().max(200).nullable(),
          versions: z.array(z.string().max(100)).max(MAX_ADVISORY_VERSIONS),
        }),
      )
      .max(MAX_ADVISORY_PACKAGES),
  }),
  z.object({ type: z.literal("reconcile_deliveries") }),
  z.object({
    type: z.literal("dependabot_malware"),
    repo: repoName,
    ecosystem: z.string().max(50),
    name: z.string().max(214),
    manifest: z.string().max(1024),
    advisory: z.string().max(100),
    summary: z.string().max(300),
    range: z.string().max(200).nullable(),
    url: z.string().url().max(500),
  }),
  z.object({ type: z.literal("register_installation"), installationId, installedBy: z.string().max(100) }),
  z.object({ type: z.literal("uninstall"), installationId, org: z.string().max(100), by: z.string().max(100) }),
  z.object({
    type: z.literal("settings_alert"),
    repo: repoName,
    ruleId: z.enum(["deploy-key-added", "protection-weakened", "protection-deleted"]),
    severity: z.enum(["high", "critical"]),
    line: z.string().max(500),
  }),
  z.object({ type: z.literal("tag_snapshot"), repo: repoName }),
  z.object({ type: z.literal("tag_posture"), repo: repoName }),
  z.object({
    type: z.literal("workflow_logs"),
    repo: repoName,
    runId: z.number().int().positive(),
    workflowPath: z.string().max(1024),
    headSha: z.string().regex(/^[0-9a-f]{40}$/i),
    name: z.string().max(200),
    url: z.string().max(500),
  }),
])

export type JobMessage = z.infer<typeof jobMessage>
export type JobType = JobMessage["type"]
