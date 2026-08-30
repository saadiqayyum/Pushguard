import { redirect } from "next/navigation"
import { InstallPrompt } from "@/components/install-prompt"
import { TopNav } from "@/components/site-chrome"
import { UserMenu } from "@/components/user-menu"
import { auth, memberScopes } from "@/lib/auth"
import { resolveTenant } from "@/lib/tenant"

const NAV = [
  { href: "/dashboard", label: "Alerts" },
  { href: "/dashboard/scans", label: "Scans" },
  { href: "/dashboard/rules", label: "Rules" },
]

/**
 * The dashboard wears the same top bar as the rest of the site.
 *
 * It used to have a sidebar instead, which meant two navigations to keep in
 * step, a logo that linked nowhere, and a bar that did not stick while the
 * sidebar did. One component now, and the mark always goes home.
 *
 * The organization switcher is not here. It changes what Alerts and Settings
 * show and nothing else, so it lives on those two pages: a control above every
 * page implies it affects every page.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect("/signin")

  const login = session.login || session.user.name || ""
  const tenant = await resolveTenant(memberScopes({ login, orgs: session.orgs ?? [] }))

  return (
    <div className="site flex min-h-screen flex-col">
      <TopNav links={tenant.current ? NAV : []}>
        <UserMenu login={login} />
      </TopNav>

      <main className="flex-1 py-8">
        {tenant.current ? (
          children
        ) : (
          <div className="flex flex-1 items-center justify-center px-5 pb-20 pt-10">
            <InstallPrompt />
          </div>
        )}
      </main>
    </div>
  )
}
