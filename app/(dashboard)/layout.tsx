import Image from "next/image"
import { redirect } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { InstallPrompt } from "@/components/install-prompt"
import { OrgSwitcher } from "@/components/org-switcher"
import { UserMenu } from "@/components/user-menu"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { auth, memberScopes } from "@/lib/auth"
import { resolveTenant } from "@/lib/tenant"

// The sidebar brand block (app-sidebar.tsx) is h-16 too: both bottom borders
// must land on the same line across the top of the app.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const login = session.login || session.user.name || ""
  const tenant = await resolveTenant(memberScopes({ login, orgs: session.orgs ?? [] }))

  if (!tenant.current) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b px-4 sm:px-8">
          <div className="flex items-center gap-3">
            <Image src="/logo.svg" alt="" width={28} height={28} />
            <span className="text-lg font-semibold tracking-tight">Pushguard</span>
          </div>
          <UserMenu login={login} />
        </header>
        <main className="flex flex-1 items-center justify-center px-4 pb-20">
          <InstallPrompt />
        </main>
      </div>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-3 border-b px-4 sm:px-8">
          {/* Mobile only: on desktop the sidebar is permanent and needs no toggle. */}
          <SidebarTrigger className="-ml-1 size-8 md:hidden" />
          {/* Which org you are looking at decides every number on the page, so
              it belongs in the navbar — not tucked under the nav where a silent
              switch reads as data loss. */}
          <OrgSwitcher
            orgs={tenant.installations.map((i) => i.org)}
            current={tenant.current.org}
            allOrgs={tenant.allOrgs}
          />
          <div className="ml-auto">
            <UserMenu login={login} />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
