"use client"

import { usePathname, useRouter } from "next/navigation"
import { Building2 } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const ORG_COOKIE = "pushguard_org"
const ALL_ORGS = "__all__"

export function OrgSwitcher({
  orgs,
  current,
  allOrgs = false,
}: {
  orgs: string[]
  current: string
  allOrgs?: boolean
}) {
  const router = useRouter()
  const allowAll = ["/dashboard", "/dashboard/alerts"].includes(usePathname())

  return (
    <Select
      value={allowAll && allOrgs ? ALL_ORGS : current}
      onValueChange={(value) => {
        document.cookie = `${ORG_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
        router.refresh()
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <SelectTrigger size="sm" aria-label="Organization" className="w-44 max-w-full gap-2">
            <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <SelectValue placeholder="Organization" className="min-w-0 flex-1 text-left" />
          </SelectTrigger>
        </TooltipTrigger>
        <TooltipContent>Organization</TooltipContent>
      </Tooltip>
      <SelectContent>
        {allowAll && <SelectItem value={ALL_ORGS}>All organizations</SelectItem>}
        {orgs.map((org) => (
          <SelectItem key={org} value={org}>
            {org}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
