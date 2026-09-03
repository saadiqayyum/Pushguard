import { defineCollection, rawDb } from "./client"
import { MAX_RENAME_ROWS } from "./limits"

export type RepoDoc = {
  _id: string
  org: string
  defaultBranch: string
  branches: string[]
  branchesTruncated: boolean
  archived: boolean
  private?: boolean
  syncedAt?: Date
  updatedAt: Date
}

export const repos = defineCollection<RepoDoc>("repos", [{ keys: { org: 1 } }])

export function repoRecord(fullName: string): Promise<RepoDoc | null> {
  return repos().findOne({ _id: fullName })
}

// Merges webhook facts. Never creates a branch list; only a full sync does.
export async function noteRepo(
  fullName: string,
  patch: Partial<Pick<RepoDoc, "defaultBranch" | "archived" | "private">> & {
    addBranch?: string
    removeBranch?: string
  },
): Promise<void> {
  const { addBranch, removeBranch, ...fields } = patch
  const set = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined))

  await repos().updateOne(
    { _id: fullName },
    {
      $set: { ...set, updatedAt: new Date() },
      $setOnInsert: { org: fullName.split("/")[0], branches: [], branchesTruncated: false },
      ...(removeBranch ? { $pull: { branches: removeBranch } } : {}),
    },
    { upsert: true },
  )

  if (addBranch) {
    await repos().updateOne(
      { _id: fullName, syncedAt: { $exists: true } },
      { $addToSet: { branches: addBranch } },
    )
  }
}

export type PushActorDoc = {
  _id: string
  repo: string
  sender: string
  firstSeenAt: Date
  pushes: number
}

export const pushActors = defineCollection<PushActorDoc>("push_actors", [
  { keys: { repo: 1, firstSeenAt: -1 } },
])

// True only for the inserting caller, so two racing pushes cannot both be first.
export async function recordPushActor(repo: string, sender: string): Promise<boolean> {
  const result = await pushActors().updateOne(
    { _id: `${repo}\0${sender}` },
    { $setOnInsert: { repo, sender, firstSeenAt: new Date() }, $inc: { pushes: 1 } },
    { upsert: true },
  )
  return result.upsertedCount === 1
}

type RepoKeyed = { _id: string; repo: string; [field: string]: unknown }

// `_id` is immutable, so rows keyed by the repository name are re-inserted under
// the new key rather than updated. Capped: a rename does not license an
// unbounded rewrite.
async function rekeyByRepo(
  name: string,
  from: string,
  to: string,
  key: (doc: RepoKeyed) => string,
): Promise<number> {
  const collection = rawDb().collection<RepoKeyed>(name)
  const docs = await collection.find({ repo: from }).limit(MAX_RENAME_ROWS).toArray()
  if (docs.length === 0) return 0

  await collection.bulkWrite(
    docs.map(({ _id, ...rest }) => ({
      replaceOne: {
        filter: { _id: key({ _id, ...rest }) },
        replacement: { ...rest, repo: to },
        upsert: true,
      },
    })),
    { ordered: false },
  )
  await collection.deleteMany({ _id: { $in: docs.map((doc) => doc._id) } })
  return docs.length
}

// A repository's full name is its key in every projection, so a rename that
// moves only the repos row makes the repository look new: first-push fires
// again, alerts stop deduping, and members lose read access to their history.
export async function renameRepoProjections(from: string, to: string): Promise<void> {
  if (from === to) return

  const existing = await repos().findOne({ _id: from })
  if (existing) {
    const { _id, ...rest } = existing
    await repos().deleteOne({ _id })
    await repos().replaceOne({ _id: to }, { ...rest, updatedAt: new Date() }, { upsert: true })
  }

  await rekeyByRepo("push_actors", from, to, (doc) => `${to}\0${doc.sender as string}`)
  await rekeyByRepo(
    "repo_access",
    from,
    to,
    (doc) => `${(doc.login as string).toLowerCase()}\0${to.toLowerCase()}`,
  )
  await rekeyByRepo("alerts", from, to, (doc) => `${to}#${doc.number as number}`)
  await rekeyByRepo("pull_requests", from, to, (doc) => `${to}#${doc.number as number}`)
  await rawDb().collection("review_sessions").updateMany({ repo: from }, { $set: { repo: to } })
}

// Drop what is derived from GitHub. Scans, rules and filed alerts are the
// account's own history and survive.
export async function purgeRepoProjections(repoNames: string[]): Promise<void> {
  if (repoNames.length === 0) return
  const db = rawDb()
  await Promise.all([
    db.collection<{ _id: string }>("repos").deleteMany({ _id: { $in: repoNames } }),
    db.collection("repo_access").deleteMany({ repo: { $in: repoNames } }),
    db.collection("push_actors").deleteMany({ repo: { $in: repoNames } }),
    db.collection("pull_requests").deleteMany({ repo: { $in: repoNames } }),
  ])
}

export async function purgeOrgProjections(org: string): Promise<void> {
  const db = rawDb()
  const prefix = `^${org.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`
  await Promise.all([
    db.collection("repos").deleteMany({ org }),
    db.collection("repo_access").deleteMany({ org }),
    db.collection("push_actors").deleteMany({ repo: { $regex: prefix } }),
    db.collection("pull_requests").deleteMany({ org }),
  ])
}
