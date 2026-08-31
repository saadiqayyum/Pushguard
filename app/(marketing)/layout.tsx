import { PageField } from "@/components/page-field"
import { SiteFooter, SiteHeader } from "@/components/site-chrome"

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site site-type site-wash isolate flex min-h-screen flex-col">
      <PageField />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  )
}
