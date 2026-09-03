import { InstallPrompt } from "@/components/install-prompt"
import { TopNav } from "@/components/site-chrome"
import { UserMenu } from "@/components/user-menu"
import { pageMember } from "@/lib/auth"
import { resolveTenant } from "@/lib/tenant"

const NAV = [
  { href: "/dashboard", label: "Alerts" },
  { href: "/dashboard/scans", label: "Scans" },
  { href: "/dashboard/prs", label: "Pull requests" },
]
const MANAGER_NAV = [
  { href: "/dashboard/rules", label: "Rules" },
  { href: "/dashboard/ai", label: "AI" },
]

// The dashboard wears the same top bar as the rest of the site.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const member = await pageMember()
  const tenant = await resolveTenant(member)
  const links = tenant.manages ? [...NAV, ...MANAGER_NAV] : NAV

  return (
    <div className="site flex min-h-screen flex-col">
      <TopNav links={tenant.current ? links : []}>
        <UserMenu login={member.login} />
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
