import { redirect } from "next/navigation"
import { OrgSettingsForm } from "@/components/org-settings-form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { auth, memberScopes } from "@/lib/auth"
import { resolveTenant } from "@/lib/tenant"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const tenant = await resolveTenant(memberScopes({ login: session.login ?? "", orgs: session.orgs ?? [] }))
  if (!tenant.current) return null

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Configuration for {tenant.current.org}.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <OrgSettingsForm
            org={tenant.current.org}
            owner={tenant.current.installedBy}
            repos={tenant.current.repos ?? []}
            teams={tenant.current.teams ?? []}
            alertsRepo={tenant.current.alertsRepo}
            alertMention={tenant.current.alertMention}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recommended org hardening</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm text-muted-foreground">
          <p>Pushguard detects; these prevent. Do both.</p>
          <p>1. Org ruleset blocking force pushes on default branches.</p>
          <p>2. Require two-factor authentication for all members.</p>
          <p>3. Team-wide npm config: ignore-scripts true.</p>
        </CardContent>
      </Card>
    </div>
  )
}
