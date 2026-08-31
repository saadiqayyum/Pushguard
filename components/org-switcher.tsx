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
  const allowAll = usePathname() === "/dashboard"

  return (
    <Select
      value={allowAll && allOrgs ? ALL_ORGS : current}
      onValueChange={(value) => {
        document.cookie = `${ORG_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
        router.refresh()
      }}
    >
      <SelectTrigger size="sm" className="min-w-0 max-w-[8rem] shrink gap-2 sm:max-w-[14rem]">
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
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
