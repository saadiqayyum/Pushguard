import { SiteFooter, SiteHeader } from "@/components/site-chrome"

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="site site-type flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  )
}
