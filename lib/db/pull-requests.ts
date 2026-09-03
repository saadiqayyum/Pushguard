import { defineCollection } from "./client"
import { accessibleRepos } from "./access"
import { alerts } from "./alerts"

// Open pull requests, as a projection. A closed or merged one is deleted.
export type PullRequestDoc = {
  _id: string
  repo: string
  org: string
  number: number
  title: string
  author: string
  headRef: string
  headSha: string
  baseRef: string
  draft: boolean
  url: string
  openedAt: Date
  updatedAt: Date
}

export const pullRequests = defineCollection<PullRequestDoc>("pull_requests", [
  { keys: { org: 1, updatedAt: -1 } },
  { keys: { repo: 1 } },
])

const pullRequestId = (repo: string, number: number) => `${repo}#${number}`

export type PullRequestFacts = Omit<PullRequestDoc, "_id" | "org">

export async function upsertPullRequest(facts: PullRequestFacts): Promise<void> {
  await pullRequests().updateOne(
    { _id: pullRequestId(facts.repo, facts.number) },
    { $set: { org: facts.repo.split("/")[0], ...facts } },
    { upsert: true },
  )
}

export async function removePullRequest(repo: string, number: number): Promise<void> {
  await pullRequests().deleteOne({ _id: pullRequestId(repo, number) })
}

// Replace one repository's rows with what GitHub lists as open right now.
export async function replaceRepoPullRequests(repo: string, open: PullRequestFacts[]): Promise<void> {
  await pullRequests().deleteMany({ repo })
  if (open.length === 0) return
  await pullRequests().insertMany(
    open.map((facts) => ({ _id: pullRequestId(repo, facts.number), org: repo.split("/")[0], ...facts })),
    { ordered: false },
  )
}

export type PullRequestPage = {
  rows: (PullRequestDoc & { openAlerts: number })[]
  total: number
  hasMore: boolean
}

export async function listOpenPullRequests(
  login: string,
  orgs: string[],
  paging: { skip: number; perPage: number },
): Promise<PullRequestPage> {
  const readable = await accessibleRepos(login)
  if (readable.length === 0) return { rows: [], total: 0, hasMore: false }

  const filter = { repo: { $in: readable }, ...(orgs.length > 0 ? { org: { $in: orgs } } : {}) }
  const [docs, total] = await Promise.all([
    pullRequests().find(filter).sort({ updatedAt: -1 }).skip(paging.skip).limit(paging.perPage).toArray(),
    pullRequests().countDocuments(filter),
  ])
  if (docs.length === 0) return { rows: [], total, hasMore: false }

  const flagged = await alerts()
    .find(
      {
        archivedAt: null,
        state: "open",
        $or: docs.map((doc) => ({ repo: doc.repo, "pullRequest.number": doc.number })),
      },
      { projection: { repo: 1, "pullRequest.number": 1 } },
    )
    .toArray()
  const counts = new Map<string, number>()
  for (const alert of flagged) {
    const key = pullRequestId(alert.repo, alert.pullRequest!.number)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return {
    rows: docs.map((doc) => ({ ...doc, openAlerts: counts.get(doc._id) ?? 0 })),
    total,
    hasMore: paging.skip + docs.length < total,
  }
}
