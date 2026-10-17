import Link from "next/link"
import { CONTAINER } from "@/components/app-header"
import { MARKETING_NAV,  } from "@/components/marketing/nav"

const LINK = "flex h-10 items-center rounded-md transition-colors hover:text-foreground"

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t">
      <div className={`${CONTAINER} flex flex-col gap-2 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between`}>
        <p className="text-xs">Pushguard. MIT licensed.</p>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6">
          {MARKETING_NAV.map((item) => (
            <Link key={item.href} href={item.href} className={LINK}>
              {item.label}
            </Link>
          ))}
          <Link href="/terms" className={LINK}>
            Terms
          </Link>
          <Link href="/privacy" className={LINK}>
            Privacy
          </Link>
        </nav>
      </div>
    </footer>
  )
}
