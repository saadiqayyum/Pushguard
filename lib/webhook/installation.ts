import {
  activeInstallation,
  addInstallationRepos,
  dropIndex,
  enqueueJob,
  enqueueJobs,
  noteChainEvent,
  purgeOrgProjections,
  purgeRepoProjections,
  registerInstallation,
  removeInstallationRepos,
  removeOrgMember,
  revokeOrgAccess,
  setInstallationTeam,
  updateInstallation,
  upsertOrgMember,
} from "@/lib/db"
import { SYNC_REPOS_PER_JOB } from "@/lib/jobs/limits"
import { logger } from "@/lib/logger"
import { metaAlert } from "@/lib/meta-alerts"
import { announce } from "@/lib/realtime"
import type { JobMessage } from "@/schemas/job"
import {
  installationPayloadSchema,
  installationReposPayloadSchema,
  memberPayloadSchema,
  membershipPayloadSchema,
  organizationPayloadSchema,
  teamPayloadSchema,
  teamRepoPayloadSchema,
} from "@/schemas/webhook"

// One sync job per batch of repositories; an index, a tag baseline and a tag
// posture check per repository.
export async function queueRepoSync(installationId: number, repos: string[]): Promise<void> {
  const jobs: JobMessage[] = []
  for (let i = 0; i < repos.length; i += SYNC_REPOS_PER_JOB) {
    jobs.push({ type: "sync_repos", installationId, repos: repos.slice(i, i + SYNC_REPOS_PER_JOB) })
  }
  for (const repo of repos) {
    jobs.push({ type: "index", repo, installationId, ref: "HEAD", reason: "install" })
    jobs.push({ type: "tag_snapshot", repo }, { type: "tag_posture", repo })
  }
  await enqueueJobs(jobs)
}

// Shared by the installation webhook and by sign-in discovering an install
// whose webhook never arrived.
export async function registerAndSync(install: {
  org: string
  installationId: number
  accountType: "User" | "Organization"
  installedBy: string
  repos?: string[]
}): Promise<void> {
  const { org, installationId, accountType, repos } = install
  const row = await registerInstallation({ ...install, ...(repos ? { repos } : {}) })
  if (accountType === "Organization") await enqueueJob({ type: "sync_org_members", installationId, org })
  else await upsertOrgMember(org, org, "admin")
  await queueRepoSync(installationId, row.repos ?? [])
  logger.info("installation_registered", { org, installationId, repos: row.repos?.length ?? 0 })
  await announce(org, "installation")
}

// Stops watching now; the job sends the meta-alert, then deletes the org's data.
async function queueUninstall(org: string, installationId: number, by: string): Promise<void> {
  await updateInstallation(org, { active: false })
  await enqueueJob({ type: "uninstall", installationId, org, by })
  logger.info("installation_removed", { org, installationId })
  await announce(org, "installation")
}

export async function handleInstallation(raw: string): Promise<number> {
  const payload = installationPayloadSchema.parse(JSON.parse(raw))
  const org = payload.installation.account.login
  const installationId = payload.installation.id

  if (payload.action === "created" || payload.action === "unsuspend") {
    await registerAndSync({
      org,
      installationId,
      accountType: payload.installation.account.type === "Organization" ? "Organization" : "User",
      installedBy: payload.sender.login,
      repos: payload.repositories?.map((r) => r.full_name),
    })
    return 204
  }

  if (payload.action === "deleted") {
    await queueUninstall(org, installationId, payload.sender.login)
    return 204
  }

  if (payload.action === "suspend") {
    await metaAlert("installation_suspend", org, [`By @${payload.sender.login}. Pushes to ${org} are no longer watched.`])
    const covered = (await activeInstallation(org))?.repos ?? []
    await updateInstallation(org, { active: false })
    await purgeOrgProjections(org)
    await dropIndex(covered)
    logger.info("installation_removed", { org, installationId, action: payload.action, repos: covered.length })
    await announce(org, "installation")
  }
  return 204
}

export async function handleInstallationRepos(raw: string): Promise<number> {
  const payload = installationReposPayloadSchema.parse(JSON.parse(raw))
  const org = payload.installation.account.login
  const added = payload.repositories_added.map((r) => r.full_name)
  const removed = payload.repositories_removed.map((r) => r.full_name)

  if (removed.length > 0) {
    await metaAlert("repo_removed", org, [
      `By @${payload.sender.login}: ${removed.slice(0, 5).join(", ")}${removed.length > 5 ? ` and ${removed.length - 5} more` : ""}`,
    ])
    await removeInstallationRepos(org, removed)
    await purgeRepoProjections(removed)
    await dropIndex(removed)
  }
  if (added.length > 0) {
    await addInstallationRepos(org, added)
    const installation = await activeInstallation(org)
    if (installation) await queueRepoSync(installation.installationId, added)
  }
  logger.info("installation_repos_updated", { org, added: added.length, removed: removed.length })
  return 204
}

export async function handleTeam(raw: string): Promise<number> {
  const repoChange = teamRepoPayloadSchema.safeParse(JSON.parse(raw))
  if (
    repoChange.success &&
    repoChange.data.repository &&
    (repoChange.data.action === "added_to_repository" || repoChange.data.action === "removed_from_repository")
  ) {
    const org = repoChange.data.organization.login
    const installation = await activeInstallation(org)
    if (installation) {
      await enqueueJob({
        type: "sync_team_repo",
        installationId: installation.installationId,
        org,
        slug: repoChange.data.team.slug,
        repo: repoChange.data.repository.full_name,
        action: repoChange.data.action === "added_to_repository" ? "granted" : "revoked",
      })
    }
    return 204
  }

  const payload = teamPayloadSchema.parse(JSON.parse(raw))
  const org = payload.organization.login
  const slug = `${org}/${payload.team.slug}`
  const previous = payload.changes?.slug?.from
  await setInstallationTeam(org, slug, payload.action !== "deleted", previous ? `${org}/${previous}` : undefined)
  logger.info("installation_team_updated", { org, team: slug, action: payload.action })
  return 204
}

export async function handleMember(raw: string): Promise<number> {
  const payload = memberPayloadSchema.parse(JSON.parse(raw))
  const repo = payload.repository.full_name
  const installation = await activeInstallation(payload.repository.owner.login)
  if (installation) await enqueueJob({ type: "sync_repo_access", installationId: installation.installationId, repo })
  if (installation && payload.action === "added") {
    await noteChainEvent(installation.org, { kind: "member_added", repo, login: payload.member.login, detail: repo })
  }
  logger.info("member_changed", { repo, action: payload.action })
  return 204
}

export async function handleMembership(raw: string): Promise<number> {
  const payload = membershipPayloadSchema.parse(JSON.parse(raw))
  const org = payload.organization.login
  const installation = await activeInstallation(org)
  if (installation) {
    await enqueueJob({
      type: "sync_team_member",
      installationId: installation.installationId,
      org,
      slug: payload.team.slug,
      login: payload.member.login,
      action: payload.action === "added" ? "added" : "removed",
    })
  }
  return 204
}

export async function handleOrganization(raw: string): Promise<number> {
  const payload = organizationPayloadSchema.parse(JSON.parse(raw))
  const org = payload.organization.login
  const login = payload.membership?.user.login

  if (payload.action === "member_added" && login) {
    if (await activeInstallation(org)) {
      await upsertOrgMember(org, login, payload.membership?.role === "admin" ? "admin" : "member")
      await noteChainEvent(org, { kind: "member_added", repo: null, login, detail: org })
    }
    logger.info("org_member_added", { org, login })
    return 204
  }

  if (payload.action === "member_removed" && login) {
    await removeOrgMember(org, login)
    const removed = await revokeOrgAccess(org, login)
    logger.info("org_access_revoked", { org, login, removed })
    return 204
  }

  if (payload.action === "member_invited" && login) {
    logger.info("org_membership_changed", { org, login, action: payload.action })
    return 204
  }

  if (payload.action === "deleted") {
    const installation = await activeInstallation(org)
    if (installation) await queueUninstall(org, installation.installationId, payload.sender?.login ?? org)
    logger.info("org_lifecycle", { org, action: payload.action })
  }

  if (payload.action === "renamed") {
    const previous = payload.changes?.login?.from ?? org
    await purgeOrgProjections(previous)
    await updateInstallation(previous, { active: true })
    logger.info("org_lifecycle", { org: previous, action: payload.action })
  }
  return 204
}
