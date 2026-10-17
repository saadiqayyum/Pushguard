import Link from "next/link"
import { Logo } from "@/components/logo"
import { DesktopNav, MobileNav } from "@/components/nav-item"
import { ThemeToggle } from "@/components/theme"
import type { NavLink } from "@/lib/dashboard-state"

// Every page frame uses this width, so the logo, page titles and footer share one left edge.
export const CONTAINER = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8"

export function AppHeader({ links, children }: { links: NavLink[]; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 h-16 shrink-0 border-b bg-background/85 backdrop-blur-md">
      <div className={`${CONTAINER} flex h-full items-center gap-6`}>
        <Link href="/" className="flex h-10 shrink-0 items-center gap-2.5 rounded-md text-foreground">
          <Logo className="size-6" />
          <span className="mono text-[0.95rem] font-semibold tracking-tight">Pushguard</span>
        </Link>
        <DesktopNav links={links} />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ThemeToggle />
          {children}
          <MobileNav links={links} />
        </div>
      </div>
    </header>
  )
}
