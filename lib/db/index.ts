import { MongoClient, type Collection, type Db } from "mongodb"
import { env } from "@/lib/env"
import type { ErrorCode } from "@/lib/errors"
import type { Rule, Severity } from "@/schemas/rule"

export type RuleDoc = {
  _id: string
  // The account the rule set belongs to (an installation's installedBy), not a
  // single org: one rule set applies to every org that account installed on.
  // Per-org narrowing is expressed inside the rule with `repos`.
  owner: string
  ruleId: string
  body: Rule
  enabled: boolean
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export type RuleVersionDoc = {
  _id: string
  ruleId: string
  body: Rule
  action: "created" | "updated" | "enabled" | "disabled"
  changedBy: string
  changedAt: Date
}

export type InstallationDoc = {
  _id: string
  org: string
  installationId: number
  active: boolean
  // Repos the app is installed on, kept fresh by installation webhooks so the
  // dashboard never has to ask GitHub. undefined = never populated (pre-webhook
  // install), which triggers a one-time backfill in resolveTenant.
  repos?: string[]
  // Team slugs as `org/team`, for the alert-mention picker. Always [] on a
  // personal account: no teams exist there.
  teams?: string[]
  accountType?: "User" | "Organization"
  // Optional override. Null means alerts are filed in the repo that triggered them.
  alertMention: string | null
  installedBy: string
  createdAt: Date
  updatedAt: Date
}

export type ScanFinding = {
  ruleId: string
  severity: Severity
  description?: string
  repo: string
  files: string[]
  // Sample of the added lines that matched, already capped by the scanner.
  lines: string[]
}

/**
 * What a scan actually read, per repository. Findings alone cannot say this: a
 * repository with nothing flagged still needs to show that it was looked at, on
 * which branch, and across which commits, otherwise "no findings" is
 * indistinguishable from "not scanned".
 */
export type ScanRepo = {
  repo: string
  branch: string
  commits: number
  headSha: string
  baseSha: string | null
  /** The diff hit its size cap, so the reading was partial. */
  truncated: boolean
}

export type ScanStatus = "queued" | "running" | "done" | "failed"

export type ScanDoc = {
  _id: string
  /** The GitHub login that ran it. Scans are private to their owner. */
  owner: string
  /** What was scanned, for display: `owner/repo` or the account name. */
  target: string
  /** The branch that was asked for. Absent means each repository's default. */
  branch?: string
  scope: "repo" | "org"
  status: ScanStatus
  // Present while queued or running, absent otherwise: a unique partial index on
  // it is what stops one owner queueing a second scan over the top of the first.
  active?: true
  // Always set. There is no unauthenticated read path: `repos` was narrowed to
  // what the requester could read before this document existed.
  installationId: number
  account: string
  repos: string[]
  scanned: ScanRepo[]
  findings: ScanFinding[]
  // Repos left unscanned because the scan hit its repository cap.
  skippedRepos: number
  error?: string
  // Why it failed, when the UI needs to act on it rather than just print it.
  // "install_required" is the one the front page turns into a button.
  errorCode?: ErrorCode
  filed: { repo: string; number: number; url: string }[]
  createdAt: Date
  startedAt?: Date
  finishedAt?: Date
}

/**
 * One row the first time an account pushes to a repository, and a counter after
 * that. The engine stays pure, so "is this their first push here?" is answered
 * here and handed in as a boolean. The same way `forced` arrives from the
 * payload.
 */
/**
 * Per-repository facts the dashboard would otherwise ask GitHub for on every
 * interaction: the default branch and the branch list.
 *
 * Filled on first use rather than at install, seeding every repository up
 * front would be a burst of API calls for repositories nobody opens. After
 * that it is webhook-maintained: `create`/`delete` move branches, `repository`
 * moves the default and the name, and every `push` self-heals both.
 *
 * Deliberately NOT an authorization record. Which repositories a *user* may
 * read is asked of GitHub every time, caching that is the bug this app
 * already had once.
 */
export type RepoDoc = {
  /** `owner/name`. */
  _id: string
  org: string
  defaultBranch: string
  branches: string[]
  /** The repo has more branches than we store; the picker is a subset. */
  branchesTruncated: boolean
  archived: boolean
  /** Visibility, maintained by the `public` and `repository` events. */
  private?: boolean
  /** Set once the branch list has been read in full. Absent means never synced. */
  syncedAt?: Date
  updatedAt: Date
}

// A repository with thousands of branches is not something a dropdown can serve,
// and storing them all would bloat the document for no gain.
export const MAX_STORED_BRANCHES = 300

/**
 * Who can read what, as a projection.
 *
 * The one thing GitHub will not hand us as a single event, so it is assembled
 * from `GET /collaborators` at install time. GitHub has already flattened org
 * role, team grants and direct collaboration into that list. And then kept
 * current by the `member`, `membership`, `team` and `organization` webhooks.
 *
 * `grants` is a set of reasons, not a boolean, because access overlaps: losing a
 * team should not revoke someone who is also a direct collaborator. Access
 * exists while the set is non-empty.
 *
 * The trade this buys: no GitHub call on any request. The cost is that a webhook
 * GitHub never sent, or one that failed delivery, leaves someone with access
 * they should have lost, until the reconciliation cron corrects it.
 */
/**
 * An alert we filed, mirrored locally.
 *
 * The GitHub issue stays the source of truth. It is where people actually
 * triage. But the feed is served from here so opening the dashboard costs no
 * GitHub call. The `issues` and `issue_comment` webhooks keep it current.
 *
 * `acknowledgedAt` is the part that is not just a mirror: it records the first
 * time a human did anything to the issue, which is the difference between
 * "three criticals" and "three criticals nobody has opened".
 */
export type AlertDoc = {
  /** `${repo}#${number}`. */
  _id: string
  repo: string
  org: string
  number: number
  url: string
  title: string
  severity: Severity
  ruleIds: string[]
  /** What actually matched: rule, files, and the offending lines. */
  findings: ScanFinding[]
  /** The push that triggered it. Absent on alerts filed from a scan. */
  push?: {
    branch: string
    sender: string
    pusherEmail: string | null
    before: string
    after: string
    forced: boolean
  }
  /** Everything done to the issue since, newest last. */
  activity: { action: string; by: string | null; at: Date }[]
  /**
   * The issue conversation, mirrored. The point of the alert page is that the
   * whole story is in one place; a link to GitHub for the replies would defeat
   * it. Bodies are capped and the list is trimmed. This is a mirror, not an
   * archive.
   */
  comments: { id: number; by: string; body: string; at: Date }[]
  /** Where it came from: a live push, or a scan someone filed. */
  source: "push" | "scan"
  /** How many times these rules have fired here since the issue was opened. */
  occurrences: number
  lastSeenAt: Date
  state: "open" | "closed"
  /** First human action, comment, assignment, close. Null while untouched. */
  acknowledgedAt: Date | null
  acknowledgedBy: string | null
  /** Who it is assigned to now. Empty means nobody owns it. */
  assignees: string[]
  /**
   * Hidden from the feed. Local only. The GitHub issue is untouched, because
   * "I have dealt with this in my list" and "this is resolved" are different
   * claims and only the second belongs on the issue.
   */
  archivedAt: Date | null
  archivedBy: string | null
  createdAt: Date
  updatedAt: Date
}

export type RepoAccessDoc = {
  /** `${login}\u0000${repo}`, both lowercased. GitHub logins are case-insensitive. */
  _id: string
  login: string
  repo: string
  org: string
  installationId: number
  /** e.g. `collaborator`, `team:acme/devs`. Non-empty means access. */
  grants: string[]
  /**
   * Can change things, not just read them. Triage or above on GitHub. Closing
   * an alert needs this; seeing one does not.
   */
  write: boolean
  updatedAt: Date
}

export type PushActorDoc = {
  /** `${repo}\u0000${sender}`. The pair is the identity. */
  _id: string
  repo: string
  sender: string
  firstSeenAt: Date
  pushes: number
}

let clientPromise: Promise<MongoClient> | null = null
let indexed = false

async function connect(): Promise<Db> {
  clientPromise ??= new MongoClient(env().MONGODB_URI).connect()
  const db = (await clientPromise).db()
  if (!indexed) {
    indexed = true
    // Index creation must never take the app down: a failed build (a pending
    // migration, a pre-existing duplicate) would otherwise make every query
    // throw. Log loudly and carry on; uniqueness is also enforced at write time.
    await Promise.all(
      [
        db.collection("rules").createIndex({ owner: 1, enabled: 1 }),
        db.collection("rules").createIndex({ owner: 1, ruleId: 1 }, { unique: true }),
        db.collection("rule_versions").createIndex({ ruleId: 1 }),
        db.collection("installations").createIndex({ org: 1 }, { unique: true }),
        db.collection("push_actors").createIndex({ repo: 1, firstSeenAt: -1 }),
        db.collection("repos").createIndex({ org: 1 }),
        db.collection("repo_access").createIndex({ login: 1, repo: 1 }),
        db.collection("repo_access").createIndex({ repo: 1 }),
        db.collection("repo_access").createIndex({ login: 1, installationId: 1 }),
        db.collection("alerts").createIndex({ org: 1, createdAt: -1 }),
        db.collection("alerts").createIndex({ repo: 1, number: 1 }),
        db.collection("alerts").createIndex({ org: 1, acknowledgedAt: 1 }),
        db.collection("scans").createIndex({ owner: 1, createdAt: -1 }),
        db.collection("scans").createIndex({ status: 1, createdAt: 1 }),
        // One live scan per owner, enforced by the database rather than by a
        // read-then-write that two tabs can both win.
        db.collection("scans").createIndex({ owner: 1 }, { unique: true, partialFilterExpression: { active: true } }),
      ].map((p) =>
        p.catch((error: unknown) => {
          console.error(
            JSON.stringify({
              level: "error",
              message: "index_create_failed",
              error: error instanceof Error ? error.message : String(error),
            }),
          )
        }),
      ),
    )
  }
  return db
}

export async function rulesCollection(): Promise<Collection<RuleDoc>> {
  return (await connect()).collection<RuleDoc>("rules")
}

export async function ruleVersionsCollection(): Promise<Collection<RuleVersionDoc>> {
  return (await connect()).collection<RuleVersionDoc>("rule_versions")
}

export async function installationsCollection(): Promise<Collection<InstallationDoc>> {
  return (await connect()).collection<InstallationDoc>("installations")
}

/**
 * An open alert in this repository already covering any of these rules.
 *
 * Deduping only on the commit SHA meant a second push breaking the same rule
 * opened a second issue, and a third opened a third. The same finding filed
 * over and over while the first one sat unread. A repeat of something already
 * open is a comment on that issue, not a new one.
 *
 * A Mongo lookup rather than a GitHub issue search: it is a read, and reads do
 * not call GitHub.
 */
export async function openAlertForRules(repo: string, ruleIds: string[]): Promise<AlertDoc | null> {
  return (await alertsCollection()).findOne(
    { repo, state: "open", archivedAt: null, ruleIds: { $in: ruleIds } },
    // Oldest first: the original is the one to add to. Threading onto the
    // newest would leave the first report. The one nobody has read, buried
    // under its own repeats.
    { sort: { createdAt: 1 } },
  )
}

/** Already reported this exact commit. A redelivered webhook, or a retry. */
export async function alertExistsForCommit(repo: string, sha: string): Promise<boolean> {
  return (
    (await (await alertsCollection()).countDocuments(
      { repo, "push.after": sha },
      { limit: 1 },
    )) > 0
  )
}

/** Another sighting of something already open. */
export async function recordOccurrence(id: string): Promise<number> {
  const updated = await (await alertsCollection()).findOneAndUpdate(
    { _id: id },
    { $inc: { occurrences: 1 }, $set: { lastSeenAt: new Date(), updatedAt: new Date() } },
    { returnDocument: "after" },
  )
  return updated?.occurrences ?? 1
}

const MAX_COMMENT_CHARS = 4000
const MAX_COMMENTS = 50

/** Mirror one comment. Idempotent on the comment id, so an edit replaces. */
export async function upsertAlertComment(
  repo: string,
  number: number,
  comment: { id: number; by: string; body: string; at: Date },
): Promise<void> {
  const alerts = await alertsCollection()
  const id = `${repo}#${number}`
  const trimmed = { ...comment, body: comment.body.slice(0, MAX_COMMENT_CHARS) }

  // Drop any previous copy first: an edit arrives with the same id.
  await alerts.updateOne({ _id: id }, { $pull: { comments: { id: comment.id } } })
  await alerts.updateOne(
    { _id: id },
    { $push: { comments: { $each: [trimmed], $slice: -MAX_COMMENTS } }, $set: { updatedAt: new Date() } },
  )
}

export async function removeAlertComment(repo: string, number: number, commentId: number): Promise<void> {
  await (await alertsCollection()).updateOne(
    { _id: `${repo}#${number}` },
    { $pull: { comments: { id: commentId } }, $set: { updatedAt: new Date() } },
  )
}

/** The issue is gone or has moved; the row points at nothing. */
export async function forgetAlert(repo: string, number: number): Promise<void> {
  await (await alertsCollection()).deleteOne({ _id: `${repo}#${number}` })
}

export async function alertsCollection(): Promise<Collection<AlertDoc>> {
  return (await connect()).collection<AlertDoc>("alerts")
}

export async function recordAlert(
  alert: Omit<
    AlertDoc,
    | "_id"
    | "org"
    | "state"
    | "acknowledgedAt"
    | "acknowledgedBy"
    | "assignees"
    | "archivedAt"
    | "archivedBy"
    | "occurrences"
    | "lastSeenAt"
    | "activity"
    | "comments"
    | "updatedAt"
  >,
): Promise<void> {
  const now = new Date()
  await (await alertsCollection()).updateOne(
    { _id: `${alert.repo}#${alert.number}` },
    {
      $set: { ...alert, org: alert.repo.split("/")[0], lastSeenAt: now, updatedAt: now },
      $setOnInsert: {
        state: "open" as const,
        acknowledgedAt: null,
        acknowledgedBy: null,
        assignees: [],
        activity: [],
        comments: [],
        archivedAt: null,
        archivedBy: null,
        occurrences: 1,
      },
    },
    { upsert: true },
  )
}

/**
 * Apply what an issue webhook just told us.
 *
 * `by` is the account that acted. Our own app's writes are passed as null so
 * that filing an alert, or commenting on one automatically, never counts as
 * somebody having looked at it.
 */
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
  const id = `${repo}#${number}`
  const alerts = await alertsCollection()
  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.state) set.state = patch.state
  if (patch.assignees) set.assignees = patch.assignees
  if (patch.title) set.title = patch.title
  // Our own writes at creation. Three labels and the open, are not a history
  // anyone wants to read. Only what a person did is recorded.
  if (patch.by) {
    await alerts.updateOne(
      { _id: id },
      {
        $set: set,
        // Capped: an issue somebody labels twenty times is not twenty facts
        // worth keeping, and the document has to stay small.
        $push: {
          activity: {
            $each: [{ action: patch.action ?? "updated", by: patch.by, at: new Date() }],
            $slice: -50,
          },
        },
      },
    )
  } else {
    await alerts.updateOne({ _id: id }, { $set: set })
  }

  // Only the first touch is recorded, and the filter is what makes it the
  // first: a later actor cannot overwrite who actually looked at it.
  if (patch.by) {
    await alerts.updateOne(
      { _id: id, acknowledgedAt: null },
      { $set: { acknowledgedAt: new Date(), acknowledgedBy: patch.by } },
    )
  }
}

export type AlertPageDoc = { alerts: AlertDoc[]; total: number; hasMore: boolean }

/**
 * The feed, from the mirror. Scoped to repositories the reader can actually
 * see. The projection is the ACL here exactly as it is for scanning, so an
 * alert in a repository they cannot open never appears.
 */
/** Archive or restore, for alerts the caller can read. Returns how many moved. */
export async function setAlertsArchived(
  login: string,
  ids: string[],
  archived: boolean,
): Promise<number> {
  const readable = new Set(await accessibleRepos(login))
  const allowed = ids.filter((id) => readable.has(id.split("#")[0]))
  if (allowed.length === 0) return 0

  const result = await (await alertsCollection()).updateMany(
    { _id: { $in: allowed } },
    {
      $set: archived
        ? { archivedAt: new Date(), archivedBy: login, updatedAt: new Date() }
        : { archivedAt: null, archivedBy: null, updatedAt: new Date() },
    },
  )
  return result.modifiedCount
}

/** One alert, for its own page. Scoped to what the reader may see. */
export async function alertDetail(login: string, repo: string, number: number): Promise<AlertDoc | null> {
  if (!(await canReadRepo(login, repo))) return null
  return (await alertsCollection()).findOne({ _id: `${repo}#${number}` })
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
    // Archived alerts are hidden rather than deleted; the record and the issue
    // both survive.
    ...(archived ? { archivedAt: { $ne: null } } : { archivedAt: null }),
  }
  const collection = await alertsCollection()
  const [alerts, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip(paging.skip).limit(paging.perPage).toArray(),
    collection.countDocuments(filter),
  ])
  return { alerts, total, hasMore: paging.skip + alerts.length < total }
}

const accessId = (login: string, repo: string) => `${login.toLowerCase()}\u0000${repo.toLowerCase()}`

export async function repoAccessCollection(): Promise<Collection<RepoAccessDoc>> {
  return (await connect()).collection<RepoAccessDoc>("repo_access")
}

/** Add a reason someone can read a repository. Idempotent. */
export async function grantRepoAccess(
  login: string,
  repo: string,
  installationId: number,
  grant: string,
): Promise<void> {
  await (await repoAccessCollection()).updateOne(
    { _id: accessId(login, repo) },
    {
      $set: { login: login.toLowerCase(), repo, org: repo.split("/")[0], installationId, updatedAt: new Date() },
      $addToSet: { grants: grant },
      // A team grant says nothing about write access on its own; the
      // collaborator sync is what establishes that.
      $setOnInsert: { write: false },
    },
    { upsert: true },
  )
}

/**
 * Remove one reason. The row is deleted only when no reason is left, so losing a
 * team does not revoke someone who is also a direct collaborator.
 */
export async function revokeRepoAccess(login: string, repo: string, grant: string): Promise<void> {
  const collection = await repoAccessCollection()
  const id = accessId(login, repo)
  await collection.updateOne({ _id: id }, { $pull: { grants: grant }, $set: { updatedAt: new Date() } })
  await collection.deleteOne({ _id: id, grants: { $size: 0 } })
}

/** Replace every grant for one repository. Used by backfill and reconciliation. */
export async function replaceRepoAccess(
  repo: string,
  installationId: number,
  collaborators: { login: string; write: boolean }[],
): Promise<void> {
  const collection = await repoAccessCollection()
  await collection.deleteMany({ repo, grants: ["collaborator"] })
  if (collaborators.length === 0) return
  const now = new Date()
  await collection.bulkWrite(
    collaborators.map(({ login, write }) => ({
      updateOne: {
        filter: { _id: accessId(login, repo) },
        update: {
          $set: {
            login: login.toLowerCase(),
            repo,
            org: repo.split("/")[0],
            installationId,
            write,
            updatedAt: now,
          },
          $addToSet: { grants: "collaborator" as const },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  )
}

/** Every repository this user may read, from the projection. No GitHub call. */
export async function accessibleRepos(login: string, installationId?: number): Promise<string[]> {
  const rows = await (await repoAccessCollection())
    .find({ login: login.toLowerCase(), ...(installationId ? { installationId } : {}) })
    .toArray()
  return rows.map((row) => row.repo).sort()
}

export async function canReadRepo(login: string, repo: string): Promise<boolean> {
  return (await (await repoAccessCollection()).countDocuments({ _id: accessId(login, repo) }, { limit: 1 })) > 0
}

export async function canWriteRepo(login: string, repo: string): Promise<boolean> {
  return (
    (await (await repoAccessCollection()).countDocuments(
      { _id: accessId(login, repo), write: true },
      { limit: 1 },
    )) > 0
  )
}

/**
 * Drop everything derived from GitHub for these repositories.
 *
 * Only projections go: the branch record, who could read it, who had pushed to
 * it. Scans, rules and filed alerts are the account's own history and survive, * losing them because a repository was removed from the installation would be
 * destroying work nobody asked to destroy.
 */
export async function purgeRepoProjections(repos: string[]): Promise<void> {
  if (repos.length === 0) return
  const db = await connect()
  await Promise.all([
    db.collection<{ _id: string }>("repos").deleteMany({ _id: { $in: repos } }),
    db.collection("repo_access").deleteMany({ repo: { $in: repos } }),
    db.collection("push_actors").deleteMany({ repo: { $in: repos } }),
  ])
}

/** The same, for a whole account, when the app is uninstalled. */
export async function purgeOrgProjections(org: string): Promise<void> {
  const db = await connect()
  await Promise.all([
    db.collection("repos").deleteMany({ org }),
    db.collection("repo_access").deleteMany({ org }),
    db.collection("push_actors").deleteMany({ repo: { $regex: `^${org.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/` } }),
  ])
}

export async function reposCollection(): Promise<Collection<RepoDoc>> {
  return (await connect()).collection<RepoDoc>("repos")
}

/** Facts about a repository, or null when nothing has been stored for it yet. */
export async function repoRecord(fullName: string): Promise<RepoDoc | null> {
  return (await reposCollection()).findOne({ _id: fullName })
}

/**
 * Merge what a webhook just told us. Never creates a branch list, only a full
 * read does that. So a `push` on an unsynced repository does not leave a
 * one-branch record that looks complete.
 */
export async function noteRepo(
  fullName: string,
  patch: Partial<Pick<RepoDoc, "defaultBranch" | "archived" | "private">> & {
    addBranch?: string
    removeBranch?: string
  },
): Promise<void> {
  const { addBranch, removeBranch, ...fields } = patch
  const set = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined))
  const collection = await reposCollection()

  await collection.updateOne(
    { _id: fullName },
    {
      $set: { ...set, updatedAt: new Date() },
      $setOnInsert: { org: fullName.split("/")[0], branches: [], branchesTruncated: false },
      ...(removeBranch ? { $pull: { branches: removeBranch } } : {}),
    },
    { upsert: true },
  )

  // $addToSet and $pull cannot touch the same field in one update, and a branch
  // is only worth adding to a list that has actually been synced.
  if (addBranch) {
    await collection.updateOne(
      { _id: fullName, syncedAt: { $exists: true } },
      { $addToSet: { branches: addBranch } },
    )
  }
}

export async function pushActorsCollection(): Promise<Collection<PushActorDoc>> {
  return (await connect()).collection<PushActorDoc>("push_actors")
}

/**
 * Record a push and say whether it was this account's first to this repository.
 *
 * One upsert, so two pushes racing cannot both be reported as the first: the
 * unique `_id` means exactly one of them inserts, and only that one sees
 * `upsertedCount === 1`.
 */
export async function recordPushActor(repo: string, sender: string): Promise<boolean> {
  const result = await (await pushActorsCollection()).updateOne(
    { _id: `${repo}\u0000${sender}` },
    { $setOnInsert: { repo, sender, firstSeenAt: new Date() }, $inc: { pushes: 1 } },
    { upsert: true },
  )
  return result.upsertedCount === 1
}

export async function scansCollection(): Promise<Collection<ScanDoc>> {
  return (await connect()).collection<ScanDoc>("scans")
}

// The installation a scan ran through, looked up by GitHub's id rather than by
// account name: the account can be renamed, the id cannot.
export async function installationById(installationId: number): Promise<InstallationDoc | null> {
  return (await installationsCollection()).findOne({ installationId, active: true })
}

export async function activeInstallation(org: string): Promise<InstallationDoc | null> {
  return (await installationsCollection()).findOne({ org, active: true })
}

export function serializeRule(doc: RuleDoc) {
  return {
    id: doc._id,
    ruleId: doc.ruleId,
    body: doc.body,
    enabled: doc.enabled,
    createdBy: doc.createdBy,
    updatedAt: doc.updatedAt.toISOString(),
  }
}

export function serializeScan(doc: ScanDoc) {
  return {
    id: doc._id,
    target: doc.target,
    branch: doc.branch ?? null,
    scope: doc.scope,
    status: doc.status,
    repos: doc.repos,
    scanned: doc.scanned ?? [],
    findings: doc.findings,
    skippedRepos: doc.skippedRepos,
    error: doc.error ?? null,
    // The one failure with a next step attached, so the client does not have to
    // pattern-match an error string to know it should offer the install link.
    needsInstall: doc.errorCode === "install_required",
    filed: doc.filed,
    account: doc.account,
    createdAt: doc.createdAt.toISOString(),
    finishedAt: doc.finishedAt?.toISOString() ?? null,
  }
}

export type ScanView = ReturnType<typeof serializeScan>

export function serializeInstallation(doc: InstallationDoc) {
  return {
    org: doc.org,
    active: doc.active,
    repos: doc.repos ?? [],
    teams: doc.teams ?? [],
    alertMention: doc.alertMention,
  }
}
