import { cookies } from "next/headers"
import { memberScopes, requireUser, type Member } from "@/lib/auth"
import { accessibleInstallationIds, db, type InstallationDoc } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { findInstallationForAccount, listInstallationRepos, listInstallationTeams } from "@/lib/github"
import { logger } from "@/lib/logger"

export const ORG_COOKIE = "pushguard_org"
// Sentinel cookie value for the merged, cross-organization alerts feed.
export const ALL_ORGS = "__all__"

// `manages` is org membership: collaborators read alerts and run scans on the
// repositories they can open, but only members change rules and model keys.
export type Tenant = {
  installations: InstallationDoc[]
  current: InstallationDoc | null
  allOrgs: boolean
  manages: boolean
}

// Fallback when the installation webhook was missed: ask GitHub directly and
// self-register. Runs only while the user has zero known installations.
async function syncInstallationsFromGitHub(memberOrgs: string[]): Promise<void> {
  const collection = db.installations()
  for (const org of memberOrgs.slice(0, 10)) {
    const installationId = await findInstallationForAccount(org)
    if (installationId === null) continue
    const now = new Date()
    await collection.updateOne(
      { org },
      {
        $set: { installationId, active: true, updatedAt: now },
        $setOnInsert: {
          _id: crypto.randomUUID(),
          alertMention: `@${org}`,
          installedBy: org,
          createdAt: now,
        },
      },
      { upsert: true },
    )
    logger.info("installation_synced_from_github", { org, installationId })
  }
}

// One-time repair for installs registered before repo/team tracking existed.
async function backfillScope(doc: InstallationDoc): Promise<InstallationDoc> {
  if (doc.repos !== undefined && doc.teams !== undefined) return doc
  try {
    const repos = await listInstallationRepos(doc.installationId)
    const accountType: "User" | "Organization" =
      repos[0]?.ownerType === "Organization" ? "Organization" : "User"
    const patch = {
      repos: repos.map((r) => r.fullName),
      teams: await listInstallationTeams(doc.installationId, doc.org, accountType),
      accountType,
      alertMention: doc.alertMention ?? `@${doc.installedBy}`,
    }
    await db.installations().updateOne({ org: doc.org }, { $set: patch })
    logger.info("installation_scope_backfilled", {
      org: doc.org,
      repos: patch.repos.length,
      teams: patch.teams.length,
    })
    return { ...doc, ...patch }
  } catch (error) {
    logger.warn("installation_scope_backfill_failed", {
      org: doc.org,
      error: error instanceof Error ? error.message : String(error),
    })
    return doc
  }
}

// Installations the user reaches as an org member or as a collaborator on any
// repository the app covers. Membership comes from the login session; the
// collaborator side is the `repo_access` projection.
async function reachableInstallations(member: Member): Promise<InstallationDoc[]> {
  const memberOrgs = memberScopes(member)
  const installationIds = await accessibleInstallationIds(member.login)
  return db.installations()
    .find({
      active: true,
      $or: [{ org: { $in: memberOrgs } }, { installationId: { $in: installationIds } }],
    })
    .sort({ org: 1 })
    .toArray()
}

export async function resolveTenant(member: Member): Promise<Tenant> {
  const memberOrgs = memberScopes(member)
  const none: Tenant = { installations: [], current: null, allOrgs: false, manages: false }
  if (memberOrgs.length === 0) return none

  let docs = await reachableInstallations(member)
  if (docs.length === 0) {
    await syncInstallationsFromGitHub(memberOrgs)
    docs = await reachableInstallations(member)
  }
  if (docs.length === 0) return none

  const preferred = (await cookies()).get(ORG_COOKIE)?.value
  const allOrgs = preferred === ALL_ORGS && docs.length > 1

  const selected =
    (!allOrgs ? docs.find((i) => i.org === preferred) : undefined) ??
    docs.find((i) => i.org === memberOrgs[0]) ??
    docs[0]

  const current = await backfillScope(selected)
  return { installations: docs, current, allOrgs, manages: memberOrgs.includes(current.org) }
}

// The guard for settings routes: signed in, an installation selected, and a
// member of the org that owns it. `owner` is the account rules are keyed by.
export async function requireManagedTenant(): Promise<{ login: string; org: string; owner: string }> {
  const user = await requireUser()
  const tenant = await resolveTenant(user)
  if (!tenant.current) throw new AppError("forbidden", "No Pushguard installation for this account")
  if (!tenant.manages) throw new AppError("forbidden", `Not a member of ${tenant.current.org}`)
  return { login: user.login, org: tenant.current.org, owner: tenant.current.installedBy }
}
