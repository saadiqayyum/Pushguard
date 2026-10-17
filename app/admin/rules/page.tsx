import Link from "next/link"
import { Plus } from "lucide-react"
import { StaffRulesList, type StaffListRow } from "@/components/admin/staff-rules-list"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { asSystem, latestPlatformRules } from "@/lib/db"
import { requirePlatformAdmin } from "@/lib/platform/auth"
import { catalogById, catalogRules, PACKS } from "@/lib/rules/catalog"
import type { Rule } from "@/schemas/rule"

export const dynamic = "force-dynamic"

export default async function StaffRulesPage() {
  await requirePlatformAdmin()
  const staff = new Map((await asSystem(() => latestPlatformRules())).map((row) => [row.id, row]))
  const own = [...staff.values()].filter((row) => !catalogById.has(row.id)).map((row) => ({ ...row.body, id: row.id }) as Rule)
  const rows: StaffListRow[] = [...catalogRules, ...own].map((rule) => {
    const row = staff.get(rule.id)
    const body = (row?.body as Rule | undefined) ?? rule
    return {
      id: rule.id,
      ruleId: rule.id,
      kind: "pattern",
      pack: body.pack ?? null,
      origin: !catalogById.has(rule.id) ? "custom" : row ? "modified" : "catalog",
      body,
      enabled: true,
      updatedAt: null,
      version: row?.version ?? null,
      status: row?.status ?? null,
    }
  })
  return (
    <div className="space-y-6">
      <PageHeader
        title="Rules"
        actions={
          <Button asChild size="sm">
            <Link href="/admin/rules/new">
              <Plus className="size-4" aria-hidden />
              New rule
            </Link>
          </Button>
        }
      />
      <StaffRulesList rows={rows} packs={PACKS.map((p) => ({ id: p.id, title: p.title }))} />
    </div>
  )
}
