import {
  grantRepoAccess,
  MAX_STORED_BRANCHES,
  replaceOrgMembers,
  replaceRepoAccess,
  revokeRepoAccess,
  saveRepo,
} from "@/lib/db"
import { fetchRepoBranches, listOrgMembers, listRepoCollaborators, listTeamMembers, listTeamRepos } from "@/lib/github"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { syncRepoPullRequests } from "@/lib/pull-requests"

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

// Read a repository's branches once and store them. After that, create and
// delete webhooks keep the list current.
export async function syncRepoBranches(installationId: number, repo: string): Promise<void> {
  const fresh = await fetchRepoBranches(installationId, repo, MAX_STORED_BRANCHES)
  await saveRepo(repo, {
    defaultBranch: fresh.defaultBranch,
    branches: fresh.branches.slice(0, MAX_STORED_BRANCHES),
    branchesTruncated: fresh.branches.length > MAX_STORED_BRANCHES,
    archived: fresh.archived ?? false,
    private: fresh.private ?? true,
    syncedAt: new Date(),
  })
}

// Everything a repository needs stored: who can read it, its branches, its open pull requests.
async function syncRepo(installationId: number, repo: string): Promise<void> {
  await Promise.all([
    syncRepoAccess(installationId, repo),
    syncRepoBranches(installationId, repo),
    syncRepoPullRequests(installationId, repo),
  ])
}

// Repositories are synced in small batches so one install does not open
// hundreds of GitHub requests at once.
const SYNC_BATCH = 5

// A repository that is gone is logged and skipped. A rate limit is rethrown
// after the rest, so the job is retried rather than leaving a hole.
// Every repository is attempted; any failure then fails the job, so it retries
// and is recorded rather than reporting a sync that left repositories unread.
export async function syncManyRepos(installationId: number, repos: string[]): Promise<void> {
  let limited: AppError | null = null
  let failed: { repo: string; error: unknown }[] = []
  for (let i = 0; i < repos.length; i += SYNC_BATCH) {
    const batch = repos.slice(i, i + SYNC_BATCH)
    const results = await Promise.allSettled(batch.map((repo) => syncRepo(installationId, repo)))
    results.forEach((result, index) => {
      if (result.status === "fulfilled") return
      const error = result.reason
      if (error instanceof AppError && error.code === "rate_limited") limited ??= error
      failed = [...failed, { repo: batch[index], error }]
      logger.warn("repo_sync_failed", {
        repo: batch[index],
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }
  if (limited) throw limited
  if (failed.length > 0) {
    throw new AppError("upstream_github", `${failed.length} of ${repos.length} repositories did not sync: ${failed.map((f) => f.repo).join(", ")}`, {
      cause: failed[0].error,
    })
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

export async function syncOrgMembers(installationId: number, org: string): Promise<void> {
  const { members, truncated } = await listOrgMembers(installationId, org)
  await replaceOrgMembers(org, members)
  logger.info("org_members_synced", { org, members: members.length, truncated })
}
