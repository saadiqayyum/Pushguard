import type { OrgRole, TenantView } from "@/lib/tenant-view"

export type OnboardingStep = "install" | "sync"
export type SyncProgress = { synced: number; total: number }
export type NavLink = { href: string; label: string }

export const SETUP_LATER_COOKIE = "pushguard_setup_later"

// Driven by what the tables say. Only an admin waits for every repository, and
// may defer that wait: a repository they cannot read would otherwise block them.
export function onboardingStep(view: TenantView, progress: SyncProgress, deferred: boolean): OnboardingStep | null {
  const current = view.current
  if (!current) return "install"
  if (current.syncing) return "sync"
  if (current.role !== "admin" || deferred) return null
  return progress.synced < progress.total ? "sync" : null
}

export function installationSettingsUrl(org: string, installationId: number, accountType: string | null): string {
  return accountType === "Organization"
    ? `https://github.com/organizations/${org}/settings/installations/${installationId}`
    : `https://github.com/settings/installations/${installationId}`
}

export function navLinks(role: OrgRole | null | undefined): NavLink[] {
  const links = [
    { href: "/dashboard", label: "Overview" },
    { href: "/dashboard/alerts", label: "Alerts" },
    { href: "/dashboard/scans", label: "Scans" },
    { href: "/dashboard/prs", label: "Pull requests" },
  ]
  if (role) links.push({ href: "/dashboard/rules", label: "Rules" })
  if (role === "admin") {
    links.push({ href: "/dashboard/ai", label: "AI" }, { href: "/dashboard/settings", label: "Settings" })
  }
  return links
}
