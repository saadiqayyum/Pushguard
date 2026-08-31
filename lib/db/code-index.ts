import { defineCollection } from "./client"

// One document per indexed file. Names, never contents: a copy of this database
// must not be a copy of anybody's source.
export type CodeIndexDoc = {
  _id: string
  repo: string
  path: string
  blobSha: string
  size: number
  tokens: string[]
  indexedAt: Date
}

export const codeIndex = defineCollection<CodeIndexDoc>("code_index", [
  { keys: { repo: 1, tokens: 1 } },
  { keys: { repo: 1 } },
])

export async function filesMentioning(repo: string, token: string, limit = 50): Promise<string[]> {
  const docs = await codeIndex()
    .find({ repo, tokens: token }, { projection: { path: 1 } })
    .limit(limit)
    .toArray()
  return docs.map((doc) => doc.path)
}

// What the indexer holds, so unchanged files are never re-read.
export async function indexedBlobs(repo: string): Promise<Map<string, string>> {
  const docs = await codeIndex()
    .find({ repo }, { projection: { path: 1, blobSha: 1 } })
    .toArray()
  return new Map(docs.map((doc) => [doc.path, doc.blobSha]))
}

export function indexedFileCount(repo: string): Promise<number> {
  return codeIndex().countDocuments({ repo })
}

export async function writeIndex(
  repo: string,
  entries: { path: string; blobSha: string; size: number; tokens: string[] }[],
  removed: string[] = [],
): Promise<void> {
  const now = new Date()
  const operations = [
    ...entries.map((entry) => ({
      replaceOne: {
        filter: { _id: `${repo}\0${entry.path}` },
        replacement: { _id: `${repo}\0${entry.path}`, repo, ...entry, indexedAt: now },
        upsert: true,
      },
    })),
    ...(removed.length > 0
      ? [{ deleteMany: { filter: { _id: { $in: removed.map((path) => `${repo}\0${path}`) } } } }]
      : []),
  ]
  if (operations.length > 0) await codeIndex().bulkWrite(operations, { ordered: false })
}

export async function dropIndex(repoNames: string[]): Promise<void> {
  if (repoNames.length === 0) return
  await codeIndex().deleteMany({ repo: { $in: repoNames } })
}

export type IndexJobDoc = {
  _id: string
  repo: string
  installationId: number
  reason: "install" | "push"
  paths?: string[]
  removed?: string[]
  ref: string
  status: "queued" | "running" | "done" | "failed"
  attempts: number
  error?: string
  createdAt: Date
  startedAt?: Date
}

export const indexJobs = defineCollection<IndexJobDoc>("index_jobs", [
  { keys: { status: 1, createdAt: 1 } },
  { keys: { repo: 1 }, options: { unique: true, partialFilterExpression: { status: "queued" } } },
])
