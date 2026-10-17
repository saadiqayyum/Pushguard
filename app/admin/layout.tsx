import type { Metadata } from "next"
import { AppHeader, CONTAINER } from "@/components/app-header"
import { UserMenu } from "@/components/user-menu"
import { TermsGate } from "@/components/terms-gate"
import { SignInGate } from "@/components/signin-dialog"
import { platformAdminPage } from "@/lib/platform/auth"
import { pageTerms } from "@/lib/tenant"
import { TERMS_VERSION } from "@/lib/terms"

export const metadata: Metadata = { title: "Console", robots: { index: false, follow: false } }

const LINKS = [
  { href: "/admin/rules", label: "Rules" },
  { href: "/admin/checks", label: "Checks" },
  { href: "/admin/shadow", label: "Shadow" },
  { href: "/admin/inbox", label: "Inbox" },
  { href: "/admin/audit", label: "Audit" },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await platformAdminPage()
  if (admin.reauth) return <SignInGate switching />
  if (!(await pageTerms()).accepted) return <TermsGate version={TERMS_VERSION} />
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppHeader links={LINKS}>
        <UserMenu login={admin.login} />
      </AppHeader>
      <main className={`${CONTAINER} flex-1 py-6 sm:py-8`}>{children}</main>
    </div>
  )
}
