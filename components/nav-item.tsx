"use client"

import { useState } from "react"
import Link from "next/link"
import { Menu } from "lucide-react"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import type { NavLink } from "@/components/site-chrome"

// `/dashboard` must not light up on `/dashboard/scans`, but `/dashboard/scans`
// should stay lit on `/dashboard/scans/abc`.
const isActive = (pathname: string, href: string) =>
  href === "/dashboard" ? pathname === href : pathname.startsWith(href)

/**
 * The nav links: inline on a wide screen, behind a sheet on a narrow one.
 *
 * They were one wrapping list before, which is why they spilled out of a header
 * with a fixed height. Nothing wraps now; below `md` the list moves into the
 * sheet that is already part of the component library.
 */
export function NavLinks({ links }: { links: NavLink[] }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  if (links.length === 0) return null

  return (
    <>
      <NavigationMenu className="hidden max-w-none md:flex">
        <NavigationMenuList className="gap-1">
          {links.map(({ href, label }) => (
            <NavigationMenuItem key={href}>
              <NavigationMenuLink
                asChild
                active={isActive(pathname, href)}
                className={navigationMenuTriggerStyle()}
              >
                <Link href={href}>{label}</Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          ))}
        </NavigationMenuList>
      </NavigationMenu>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-64">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 px-4">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                className={
                  isActive(pathname, href)
                    ? "rounded-md bg-accent px-3 py-2 text-sm font-medium"
                    : "rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                }
              >
                {label}
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  )
}
