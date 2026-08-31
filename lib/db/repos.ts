import { defineCollection, rawDb } from "./client"

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

// Drop what is derived from GitHub. Scans, rules and filed alerts are the
// account's own history and survive.
export async function purgeRepoProjections(repoNames: string[]): Promise<void> {
  if (repoNames.length === 0) return
  const db = rawDb()
  await Promise.all([
    db.collection<{ _id: string }>("repos").deleteMany({ _id: { $in: repoNames } }),
    db.collection("repo_access").deleteMany({ repo: { $in: repoNames } }),
    db.collection("push_actors").deleteMany({ repo: { $in: repoNames } }),
  ])
}

export async function purgeOrgProjections(org: string): Promise<void> {
  const db = rawDb()
  const prefix = `^${org.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`
  await Promise.all([
    db.collection("repos").deleteMany({ org }),
    db.collection("repo_access").deleteMany({ org }),
    db.collection("push_actors").deleteMany({ repo: { $regex: prefix } }),
  ])
}
