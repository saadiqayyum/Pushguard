import { defineCollection } from "./client"

// Who can read what, as a projection.
export type RepoAccessDoc = {
  _id: string
  login: string
  repo: string
  org: string
  installationId: number
  grants: string[]
  write: boolean
  updatedAt: Date
}

export const repoAccess = defineCollection<RepoAccessDoc>("repo_access", [
  { keys: { login: 1, repo: 1 } },
  { keys: { repo: 1 } },
  { keys: { login: 1, installationId: 1 } },
])

const accessId = (login: string, repo: string) => `${login.toLowerCase()}\0${repo.toLowerCase()}`

// Add a reason someone can read a repository. Idempotent.
export async function grantRepoAccess(
  login: string,
  repo: string,
  installationId: number,
  grant: string,
): Promise<void> {
  await repoAccess().updateOne(
    { _id: accessId(login, repo) },
    {
      $set: {
        login: login.toLowerCase(),
        repo,
        org: repo.split("/")[0],
        installationId,
        updatedAt: new Date(),
      },
      $addToSet: { grants: grant },
      $setOnInsert: { write: false },
    },
    { upsert: true },
  )
}

// Remove one reason. The row is deleted only when no reason is left, so losing a
// team does not revoke someone who is also a direct collaborator.
export async function revokeRepoAccess(login: string, repo: string, grant: string): Promise<void> {
  const id = accessId(login, repo)
  await repoAccess().updateOne({ _id: id }, { $pull: { grants: grant }, $set: { updatedAt: new Date() } })
  await repoAccess().deleteOne({ _id: id, grants: { $size: 0 } })
}

// Replace every grant for one repository. Used by backfill and reconciliation.
export async function replaceRepoAccess(
  repo: string,
  installationId: number,
  collaborators: { login: string; write: boolean }[],
): Promise<void> {
  await repoAccess().deleteMany({ repo, grants: ["collaborator"] })
  if (collaborators.length === 0) return
  const now = new Date()
  await repoAccess().bulkWrite(
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

// Every repository this user may read, from the projection. No GitHub call.
export async function accessibleRepos(login: string, installationId?: number): Promise<string[]> {
  const rows = await repoAccess()
    .find({ login: login.toLowerCase(), ...(installationId ? { installationId } : {}) })
    .toArray()
  return rows.map((row) => row.repo).sort()
}

export async function canReadRepo(login: string, repo: string): Promise<boolean> {
  return (await repoAccess().countDocuments({ _id: accessId(login, repo) }, { limit: 1 })) > 0
}

export async function canWriteRepo(login: string, repo: string): Promise<boolean> {
  return (
    (await repoAccess().countDocuments({ _id: accessId(login, repo), write: true }, { limit: 1 })) > 0
  )
}
