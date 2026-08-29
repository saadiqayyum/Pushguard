"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, Settings, ShieldCheck } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

const NAV = [
  { href: "/", label: "Alerts", icon: Activity },
  { href: "/rules", label: "Rules", icon: ShieldCheck },
  { href: "/settings", label: "Settings", icon: Settings },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { isMobile } = useSidebar()

  // Permanent on desktop (no toggle button, no duplicated brand in the header);
  // an overlay sheet on mobile, where 256px of a 390px screen is not affordable.
  return (
    <Sidebar
      collapsible={isMobile ? "offcanvas" : "none"}
      className={isMobile ? undefined : "sticky top-0 h-svh border-r"}
    >
      {/* h-16 matches the page header in (dashboard)/layout.tsx so the two
          bottom borders read as one line. Padding overridden to keep the
          content vertically centred in exactly 64px. */}
      <SidebarHeader className="h-16 justify-center border-b px-4 py-0">
        <div className="flex items-center gap-3">
          <Image src="/logo.svg" alt="" width={28} height={28} />
          <span className="text-lg font-semibold tracking-tight">Pushguard</span>
        </div>
      </SidebarHeader>

      <SidebarContent className="pt-4">
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 pb-1">Monitoring</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {NAV.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === href}
                    className="h-10 gap-3 px-3 [&>svg]:size-[18px]"
                  >
                    <Link href={href}>
                      <Icon />
                      <span className="text-sm">{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
