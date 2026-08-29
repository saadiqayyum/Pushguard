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
  // Rules and settings act on exactly one org, so "All" is offered only on the
  // alerts feed. Elsewhere the trigger shows the concrete org being edited.
  const allowAll = usePathname() === "/"

  // One installation means no ambiguity and nothing to switch to.
  if (orgs.length <= 1) return null

  return (
    <Select
      value={allowAll && allOrgs ? ALL_ORGS : current}
      onValueChange={(value) => {
        document.cookie = `${ORG_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
        router.refresh()
      }}
    >
      <SelectTrigger size="sm" className="max-w-[14rem] shrink-0 gap-2">
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
