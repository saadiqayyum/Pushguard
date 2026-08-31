import Image from "next/image"
import Link from "next/link"
import { LayoutGrid } from "lucide-react"
import { auth } from "@/lib/auth"
import { NavLinks } from "@/components/nav-item"

const NAV = [{ href: "/how-to-use", label: "How to use" }]

export type NavLink = { href: string; label: string }

// The one top bar, used by the marketing pages and the dashboard.
export function TopNav({ links, children }: { links: NavLink[]; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--rule)] bg-[var(--paper)]/80 backdrop-blur-md">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 flex h-16 items-center gap-4">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Image src="/logo.svg" alt="" width={24} height={24} />
          <span className="mono text-[0.95rem] font-semibold tracking-tight">Pushguard</span>
        </Link>

        <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-4">
          <NavLinks links={links} />
          {children}
        </div>
      </div>
    </header>
  )
}

// One action in the bar. Installing is the page's own call to action, and a
// second GitHub button beside Sign in only asked which one a visitor wanted.
export async function SiteHeader() {
  const signedIn = Boolean((await auth())?.user)

  return (
    <TopNav links={NAV}>
      <Link
        href={signedIn ? "/dashboard" : "/signin"}
        className="flex h-9 items-center gap-2 rounded-lg bg-[var(--brand)] px-4 text-sm font-medium text-[var(--paper)] transition-opacity hover:opacity-90"
      >
        {signedIn ? <LayoutGrid className="size-4" /> : <GitHubMark className="size-4" />}
        {signedIn ? "Dashboard" : "Sign in"}
      </Link>
    </TopNav>
  )
}

// GitHub's mark. On a button whose destination is GitHub, this is the affordance.
export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

// The install call to action.
export function InstallButton({
  href,
  children = "Install Pushguard",
}: {
  href: string | null
  children?: React.ReactNode
}) {
  if (!href) {
    return (
      <p className="text-sm text-[var(--ink-soft)]">
        Ask the operator for the installation link, NEXT_PUBLIC_GITHUB_APP_SLUG is not set.
      </p>
    )
  }
  return (
    <a
      href={href}
      className="flex h-12 items-center gap-2.5 rounded-xl bg-[var(--brand)] px-6 font-sans text-[0.9375rem] font-medium text-[var(--paper)] transition-opacity hover:opacity-90"
    >
      <GitHubMark className="size-[1.125rem]" />
      {children}
    </a>
  )
}

// The quieter action that sits next to it.
export function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex h-12 items-center rounded-xl px-5 font-sans text-[0.9375rem] font-medium text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)]"
    >
      {children}
    </Link>
  )
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-[var(--rule)]">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 flex flex-col gap-4 py-10 text-sm text-[var(--ink-soft)] sm:flex-row sm:items-center sm:justify-between">
        <p className="mono text-xs">Pushguard, detection for the push you did not expect.</p>
        <nav className="flex flex-wrap items-center gap-5">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="transition-colors hover:text-[var(--ink)]">
              {item.label}
            </Link>
          ))}
          <a
            href="https://github.com/saadiqayyum/pushguard"
            className="transition-colors hover:text-[var(--ink)]"
            target="_blank"
            rel="noreferrer"
          >
            Source
          </a>
          <span className="mono text-xs">MIT</span>
        </nav>
      </div>
    </footer>
  )
}
