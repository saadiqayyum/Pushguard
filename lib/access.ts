import { db, grantRepoAccess, replaceRepoAccess, revokeRepoAccess } from "@/lib/db"
import { MAX_STORED_BRANCHES, repos } from "@/lib/db"
import { fetchRepoBranches, listRepoCollaborators, listTeamMembers, listTeamRepos } from "@/lib/github"
import { logger } from "@/lib/logger"
import { ownerOf } from "@/lib/finding"

// Keeps the repo-access projection current.

const TEAM_GRANT = (org: string, slug: string) => `team:${org}/${slug}`

// Re-read one repository's collaborator list and replace what we stored.
export async function syncRepoAccess(installationId: number, repo: string): Promise<number> {
  const collaborators = await listRepoCollaborators(installationId, repo)
  await replaceRepoAccess(repo, installationId, collaborators)
  logger.info("repo_access_synced", {
    repo,
    collaborators: collaborators.length,
    writers: collaborators.filter((c) => c.write).length,
  })
  return collaborators.length
}

// Read a repository's branches once and store them. From here the create,.
export async function syncRepoBranches(installationId: number, repo: string): Promise<void> {
  const fresh = await fetchRepoBranches(installationId, repo, MAX_STORED_BRANCHES)
  await repos().updateOne(
    { _id: repo },
    {
      $set: {
        org: ownerOf(repo),
        defaultBranch: fresh.defaultBranch,
        branches: fresh.branches.slice(0, MAX_STORED_BRANCHES),
        branchesTruncated: fresh.branches.length > MAX_STORED_BRANCHES,
        archived: fresh.archived ?? false,
        private: fresh.private ?? true,
        syncedAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { upsert: true },
  )
}

// Everything a repository needs stored: who can read it, and what branches it has.
async function syncRepo(installationId: number, repo: string): Promise<void> {
  await Promise.all([syncRepoAccess(installationId, repo), syncRepoBranches(installationId, repo)])
}

// Repositories are synced in small batches. A large installation would otherwise.
const SYNC_BATCH = 5

export async function syncManyRepos(installationId: number, repos: string[]): Promise<void> {
  for (let i = 0; i < repos.length; i += SYNC_BATCH) {
    await Promise.all(
      repos.slice(i, i + SYNC_BATCH).map((repo) =>
        syncRepo(installationId, repo).catch((error: unknown) => {
          logger.warn("repo_sync_failed", {
            repo,
            error: error instanceof Error ? error.message : String(error),
          })
        }),
      ),
    )
  }
}

// A team gained or lost a repository: every member of it gains or loses access.
export async function syncTeamRepo(
  installationId: number,
  org: string,
  slug: string,
  repo: string,
  action: "granted" | "revoked",
): Promise<void> {
  const members = await listTeamMembers(installationId, org, slug)
  const grant = TEAM_GRANT(org, slug)
  await Promise.all(
    members.map((login) =>
      action === "granted"
        ? grantRepoAccess(login, repo, installationId, grant)
        : revokeRepoAccess(login, repo, grant),
    ),
  )
  logger.info("team_repo_access_synced", { team: grant, repo, action, members: members.length })
}

// Someone joined or left a team: they gain or lose everything that team reaches.
export async function syncTeamMember(
  installationId: number,
  org: string,
  slug: string,
  login: string,
  action: "added" | "removed",
): Promise<void> {
  const repos = await listTeamRepos(installationId, org, slug)
  const grant = TEAM_GRANT(org, slug)
  await Promise.all(
    repos.map((repo) =>
      action === "added"
        ? grantRepoAccess(login, repo, installationId, grant)
        : revokeRepoAccess(login, repo, grant),
    ),
  )
  logger.info("team_member_access_synced", { team: grant, login, action, repos: repos.length })
}

// Left the organization: every grant in it goes, whatever its source.
export async function revokeOrgAccess(org: string, login: string): Promise<void> {
  const result = await db.repoAccess().deleteMany({ login: login.toLowerCase(), org })
  logger.info("org_access_revoked", { org, login, removed: result.deletedCount })
}

// Correct drift. GitHub does not emit an event for every way access can change,.
export async function reconcileAccess(limit = 25): Promise<number> {
  const active = await db.installations().find({ active: true }).toArray()
  let synced = 0
  for (const installation of active) {
    const repos = (installation.repos ?? []).slice(0, limit)
    await syncManyRepos(installation.installationId, repos)
    synced += repos.length
  }
  logger.info("access_reconciled", { installations: active.length, repos: synced })
  return synced
}
