import { cookies } from "next/headers"
import { cache } from "react"
import { pageMember } from "@/lib/auth"
import { accessibleInstallationIds, accessibleRepos, currentLogin, membershipsOf, reachableInstallations, withUser } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { requireTerms, termsAccepted } from "@/lib/terms"
import { authorizeOrg, buildTenantView, type OrgRole, type TenantView } from "@/lib/tenant-view"

export { ALL_ORGS, type TenantOrg, type TenantView } from "@/lib/tenant-view"
export const ORG_COOKIE = "pushguard_org"

// Read from tables on every request; the session carries identity only.
export async function loadTenant(login: string): Promise<TenantView> {
  const [memberships, reachedInstallationIds] = await Promise.all([
    membershipsOf(login),
    accessibleInstallationIds(login),
  ])
  const installations = await reachableInstallations(
    memberships.map((m) => m.org),
    reachedInstallationIds,
  )
  return buildTenantView({
    login,
    memberships,
    installations,
    reachedInstallationIds,
    preferred: (await cookies()).get(ORG_COOKIE)?.value,
  })
}

export type TenantGrant = {
  login: string
  org: string
  installationId: number
  role: OrgRole | null
  repos?: string[]
}

async function guard(need: "read" | "admin", org?: string): Promise<TenantGrant> {
  const login = currentLogin()
  if (!login) throw new AppError("unauthorized", "Sign in required")
  const target = authorizeOrg(await loadTenant(login), need, org)
  const grant = { login, org: target.org, installationId: target.installationId, role: target.role }
  if (target.role) return grant
  return { ...grant, repos: await accessibleRepos(login, target.installationId) }
}

// Call inside userRoute. `org` overrides the selected org; it must be visible.
export function requireTenant(org?: string): Promise<TenantGrant> {
  return guard("read", org)
}

export function requireAdmin(org?: string): Promise<TenantGrant> {
  return guard("admin", org)
}

// Pages: one read per render, shared by the layout and the page.
export const pageTerms = cache(async (): Promise<{ login: string; accepted: boolean }> => {
  const { login } = await pageMember()
  return { login, accepted: await withUser(login, () => termsAccepted(login)) }
})

export const pageTenant = cache(async (): Promise<TenantView> => {
  const { login, accepted } = await pageTerms()
  if (!accepted) await withUser(login, () => requireTerms(login))
  return withUser(login, () => loadTenant(login))
})
