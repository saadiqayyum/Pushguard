import type { Severity } from "@/schemas/rule"
import { defineCollection } from "./client"
import { accessibleRepos, canReadRepo } from "./access"
import { MAX_ACTIVITY, MAX_COMMENTS, MAX_COMMENT_CHARS, MAX_SIGHTINGS } from "./limits"
import type { ScanFinding } from "./scans"

export type AlertSource = "push" | "scan" | "pull_request"

export type AlertDoc = {
  _id: string
  repo: string
  org: string
  number: number
  url: string
  title: string
  severity: Severity
  ruleIds: string[]
  findings: ScanFinding[]
  push?: {
    branch: string
    sender: string
    pusherEmail: string | null
    before: string
    after: string
    forced: boolean
  }
  activity: { action: string; by: string | null; at: Date }[]
  comments: { id: number; by: string; body: string; at: Date }[]
  pullRequest?: { number: number; base: string; url: string }
  source: AlertSource
  occurrences: number
  sightings?: { at: Date; ruleIds: string[]; sha: string | null; by: string | null; pullRequest?: number }[]
  lastSeenAt: Date
  state: "open" | "closed"
  acknowledgedAt: Date | null
  acknowledgedBy: string | null
  assignees: string[]
  archivedAt: Date | null
  archivedBy: string | null
  createdAt: Date
  updatedAt: Date
}

export const alerts = defineCollection<AlertDoc>("alerts", [
  { keys: { org: 1, createdAt: -1 } },
  { keys: { repo: 1, number: 1 } },
  { keys: { org: 1, acknowledgedAt: 1 } },
])

const alertId = (repo: string, number: number) => `${repo}#${number}`

// `$all`, not `$in`. Overlap is not recurrence: a push firing `force-push` plus.
export function openAlertForRules(repo: string, ruleIds: string[]): Promise<AlertDoc | null> {
  return alerts().findOne(
    { repo, state: "open", archivedAt: null, ruleIds: { $all: ruleIds } },
    { sort: { createdAt: 1 } },
  )
}

// Per source: the push to a branch and the pull request carrying the same
// commit are two events, and each is allowed its own alert.
export async function alertExistsForCommit(repo: string, sha: string, source: AlertSource): Promise<boolean> {
  return (await alerts().countDocuments({ repo, "push.after": sha, source }, { limit: 1 })) > 0
}

export async function recordOccurrence(
  id: string,
  sighting: { ruleIds: string[]; sha: string | null; by: string | null; pullRequest?: number },
): Promise<number> {
  const updated = await alerts().findOneAndUpdate(
    { _id: id },
    {
      $inc: { occurrences: 1 },
      $push: { sightings: { $each: [{ ...sighting, at: new Date() }], $slice: -MAX_SIGHTINGS } },
      $set: { lastSeenAt: new Date(), updatedAt: new Date() },
    },
    { returnDocument: "after" },
  )
  return updated?.occurrences ?? 1
}

// Idempotent on comment id, so an edit replaces rather than duplicates.
export async function upsertAlertComment(
  repo: string,
  number: number,
  comment: { id: number; by: string; body: string; at: Date },
): Promise<void> {
  const _id = alertId(repo, number)
  const trimmed = { ...comment, body: comment.body.slice(0, MAX_COMMENT_CHARS) }
  await alerts().updateOne({ _id }, { $pull: { comments: { id: comment.id } } })
  await alerts().updateOne(
    { _id },
    { $push: { comments: { $each: [trimmed], $slice: -MAX_COMMENTS } }, $set: { updatedAt: new Date() } },
  )
}

export async function removeAlertComment(repo: string, number: number, commentId: number): Promise<void> {
  await alerts().updateOne(
    { _id: alertId(repo, number) },
    { $pull: { comments: { id: commentId } }, $set: { updatedAt: new Date() } },
  )
}

export async function forgetAlert(repo: string, number: number): Promise<void> {
  await alerts().deleteOne({ _id: alertId(repo, number) })
}

export async function recordAlert(
  alert: Omit<
    AlertDoc,
    | "_id" | "org" | "state" | "acknowledgedAt" | "acknowledgedBy" | "assignees"
    | "archivedAt" | "archivedBy" | "occurrences" | "lastSeenAt" | "activity"
    | "comments" | "sightings" | "updatedAt"
  >,
): Promise<void> {
  const now = new Date()
  await alerts().updateOne(
    { _id: alertId(alert.repo, alert.number) },
    {
      $set: { ...alert, org: alert.repo.split("/")[0], lastSeenAt: now, updatedAt: now },
      $setOnInsert: {
        state: "open" as const,
        acknowledgedAt: null,
        acknowledgedBy: null,
        assignees: [],
        activity: [],
        comments: [],
        sightings: [],
        archivedAt: null,
        archivedBy: null,
        occurrences: 1,
      },
    },
    { upsert: true },
  )
}

// `by` is null for our own writes, so filing an alert never counts as reading it.
export async function noteAlertActivity(
  repo: string,
  number: number,
  patch: {
    state?: "open" | "closed"
    by?: string | null
    assignees?: string[]
    title?: string
    action?: string
  },
): Promise<void> {
  const _id = alertId(repo, number)
  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.state) set.state = patch.state
  if (patch.assignees) set.assignees = patch.assignees
  if (patch.title) set.title = patch.title

  if (!patch.by) {
    await alerts().updateOne({ _id }, { $set: set })
    return
  }

  await alerts().updateOne(
    { _id },
    {
      $set: set,
      $push: {
        activity: {
          $each: [{ action: patch.action ?? "updated", by: patch.by, at: new Date() }],
          $slice: -MAX_ACTIVITY,
        },
      },
    },
  )
  await alerts().updateOne(
    { _id, acknowledgedAt: null },
    { $set: { acknowledgedAt: new Date(), acknowledgedBy: patch.by } },
  )
}

export type AlertPageDoc = { alerts: AlertDoc[]; total: number; hasMore: boolean }

export async function setAlertsArchived(
  login: string,
  ids: string[],
  archived: boolean,
): Promise<number> {
  const readable = new Set(await accessibleRepos(login))
  const allowed = ids.filter((id) => readable.has(id.split("#")[0]))
  if (allowed.length === 0) return 0

  const result = await alerts().updateMany(
    { _id: { $in: allowed } },
    {
      $set: archived
        ? { archivedAt: new Date(), archivedBy: login, updatedAt: new Date() }
        : { archivedAt: null, archivedBy: null, updatedAt: new Date() },
    },
  )
  return result.modifiedCount
}

export async function alertDetail(login: string, repo: string, number: number): Promise<AlertDoc | null> {
  if (!(await canReadRepo(login, repo))) return null
  return alerts().findOne({ _id: alertId(repo, number) })
}

export async function listAlerts(
  login: string,
  orgs: string[],
  paging: { skip: number; perPage: number },
  archived = false,
): Promise<AlertPageDoc> {
  const readable = await accessibleRepos(login)
  if (readable.length === 0) return { alerts: [], total: 0, hasMore: false }

  const filter = {
    repo: { $in: readable },
    ...(orgs.length > 0 ? { org: { $in: orgs } } : {}),
    ...(archived ? { archivedAt: { $ne: null } } : { archivedAt: null }),
  }
  const [rows, total] = await Promise.all([
    alerts().find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.perPage).toArray(),
    alerts().countDocuments(filter),
  ])
  return { alerts: rows, total, hasMore: paging.skip + rows.length < total }
}
