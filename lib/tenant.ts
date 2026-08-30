import { cookies } from "next/headers"
import { installationsCollection, type InstallationDoc } from "@/lib/db"
import { findInstallationForAccount, listInstallationRepos, listInstallationTeams } from "@/lib/github"
import { logger } from "@/lib/logger"

export const ORG_COOKIE = "pushguard_org"
// Sentinel cookie value for the merged, cross-organization alerts feed.
export const ALL_ORGS = "__all__"

export type Tenant = {
  installations: InstallationDoc[]
  // Always a concrete installation: rules are per-org and need
  // something to act on even while the alerts feed is showing everything.
  current: InstallationDoc | null
  allOrgs: boolean
}

// Fallback when the installation webhook was missed: ask GitHub directly and
// self-register. Runs only while the user has zero known installations.
async function syncInstallationsFromGitHub(memberOrgs: string[]): Promise<void> {
  const collection = await installationsCollection()
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
// Once `repos` is set (even to []), webhooks keep it current and this never
// runs again. The dashboard itself makes no GitHub calls for this data.
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
      // Installs predating the default get it now; this runs once, so a later
      // deliberate "no mention" is never overwritten.
      alertMention: doc.alertMention ?? `@${doc.installedBy}`,
    }
    await (await installationsCollection()).updateOne({ org: doc.org }, { $set: patch })
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

export async function resolveTenant(memberOrgs: string[]): Promise<Tenant> {
  if (memberOrgs.length === 0) return { installations: [], current: null, allOrgs: false }

  const collection = await installationsCollection()
  let installations = await collection
    .find({ org: { $in: memberOrgs }, active: true })
    .sort({ org: 1 })
    .toArray()

  if (installations.length === 0) {
    await syncInstallationsFromGitHub(memberOrgs)
    installations = await collection
      .find({ org: { $in: memberOrgs }, active: true })
      .sort({ org: 1 })
      .toArray()
  }
  if (installations.length === 0) return { installations, current: null, allOrgs: false }

  const preferred = (await cookies()).get(ORG_COOKIE)?.value
  const allOrgs = preferred === ALL_ORGS && installations.length > 1

  // memberScopes puts the user's own login first, so this prefers their personal
  // account over an alphabetically-earlier org. Without it, gaining access to a
  // new org silently moves the whole dashboard to it and reads as data loss.
  const selected =
    (!allOrgs ? installations.find((i) => i.org === preferred) : undefined) ??
    installations.find((i) => i.org === memberOrgs[0]) ??
    installations[0]

  const current = await backfillScope(selected)
  return { installations, current, allOrgs }
}

// The merged feed needs accountType on every installation, not just the selected
// one. Each of these is a no-op after its first run.
export async function backfillAll(installations: InstallationDoc[]): Promise<InstallationDoc[]> {
  return Promise.all(installations.map(backfillScope))
}
