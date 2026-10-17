import { AppHeader } from "@/components/app-header"
import { SiteFooter } from "@/components/marketing/site-footer"
import { MARKETING_NAV } from "@/components/marketing/nav"
import { SignInLink } from "@/components/signin-dialog"
import { Button } from "@/components/ui/button"

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site isolate flex min-h-screen flex-col overflow-x-clip">
      <AppHeader links={MARKETING_NAV}>
        <Button asChild size="sm">
          <SignInLink href="/dashboard">Dashboard</SignInLink>
        </Button>
      </AppHeader>
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
