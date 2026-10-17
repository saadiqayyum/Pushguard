import { redirect } from "next/navigation"
import { SettingsView } from "@/components/settings/settings-view"
import { activeInstallation, withUser } from "@/lib/db"
import { sinksFor } from "@/lib/db/alert-sinks"
import { pageTenant } from "@/lib/tenant"
import { MAX_SINKS_PER_ORG } from "@/schemas/alert-sink"
import { MAX_INDICATOR_BRANCHES } from "@/schemas/settings"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const view = await pageTenant()
  const current = view.current
  if (!current) return null
  if (current.role !== "admin") redirect("/dashboard")

  const [sinks, installation] = await withUser(view.login, () =>
    Promise.all([sinksFor(current.org), activeInstallation(current.org)]),
  )
  return (
    <SettingsView
      org={current.org}
      sinks={sinks.map((sink) => ({ ...sink, createdAt: sink.createdAt.toISOString() }))}
      maxSinks={MAX_SINKS_PER_ORG}
      branches={installation?.indicatorBranches ?? []}
      maxBranches={MAX_INDICATOR_BRANCHES}
    />
  )
}
