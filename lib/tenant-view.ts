import { AppError } from "@/lib/errors"

export type OrgRole = "admin" | "member"

// `role` null: reached only through repo_access, as an outside collaborator.
export type TenantOrg = { org: string; installationId: number; role: OrgRole | null; syncing: boolean }

export type TenantView = {
  login: string
  orgs: TenantOrg[]
  pendingOrgs: string[]
  current: TenantOrg | null
  allOrgs: boolean
}

export const ALL_ORGS = "__all__"

export function buildTenantView(input: {
  login: string
  memberships: { org: string; role: OrgRole }[]
  installations: { org: string; installationId: number }[]
  reachedInstallationIds: number[]
  preferred?: string
}): TenantView {
  const roles = new Map(input.memberships.map((m) => [m.org.toLowerCase(), m.role]))
  const reached = new Set(input.reachedInstallationIds)
  const orgs = input.installations.map((i) => ({
    org: i.org,
    installationId: i.installationId,
    role: roles.get(i.org.toLowerCase()) ?? null,
    syncing: !reached.has(i.installationId),
  }))
  const installed = new Set(orgs.map((o) => o.org.toLowerCase()))
  const pendingOrgs = input.memberships
    .map((m) => m.org)
    .filter((org) => !installed.has(org.toLowerCase()) && org.toLowerCase() !== input.login.toLowerCase())

  const allOrgs = input.preferred === ALL_ORGS && orgs.length > 1
  const current =
    orgs.find((o) => o.org === input.preferred) ??
    orgs.find((o) => o.org.toLowerCase() === input.login.toLowerCase()) ??
    orgs[0] ??
    null
  return { login: input.login, orgs, pendingOrgs, current, allOrgs }
}

// An org the user cannot see answers 404, so its existence is not revealed.
// Forbidden is only for an org they can see but do not administer.
export function authorizeOrg(view: TenantView, need: "read" | "admin", org?: string): TenantOrg {
  const target = org ? view.orgs.find((o) => o.org.toLowerCase() === org.toLowerCase()) : view.current
  if (!target) throw new AppError("not_found", "Organization not found")
  if (need === "admin" && target.role !== "admin") {
    throw new AppError("forbidden", `Only owners of ${target.org} can change this`)
  }
  return target
}
