"use client"

import { useState } from "react"
import Link from "next/link"
import { Menu } from "lucide-react"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import type { NavLink } from "@/lib/dashboard-state"

// `/dashboard` must not light up on `/dashboard/scans`, but `/dashboard/scans`
// should stay lit on `/dashboard/scans/abc`.
const isActive = (pathname: string, href: string) =>
  href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)

export function DesktopNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname()
  if (links.length === 0) return null
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {links.map(({ href, label }) => {
        const active = isActive(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-8 items-center rounded-md px-3 text-sm transition-colors hover:bg-accent hover:text-foreground",
              active ? "bg-accent font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

export function MobileNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  if (links.length === 0) return null

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 md:hidden" aria-label="Open menu">
          <Menu className="size-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(18rem,85vw)]">
        <SheetHeader>
          <SheetTitle>Pushguard</SheetTitle>
        </SheetHeader>
        <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
          {links.map(({ href, label }) => {
            const active = isActive(pathname, href)
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center rounded-md px-3 text-sm transition-colors hover:bg-accent hover:text-foreground",
                  active ? "bg-accent font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </Link>
            )
          })}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
