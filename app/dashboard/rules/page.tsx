import { redirect } from "next/navigation"
import { RulesView } from "@/components/rules-view"
import type { RuleRow } from "@/components/rule-types"
import { pageMember } from "@/lib/auth"
import { resolveRules, serializeResolvedRule } from "@/lib/rules"
import { catalogRules, PACKS } from "@/lib/rules/catalog"
import { aiKeyOptions, db } from "@/lib/db"
import { aiRuleSchema } from "@/schemas/ai-rule"
import { parsePaging } from "@/lib/paging"
import { resolveTenant } from "@/lib/tenant"

export const dynamic = "force-dynamic"

// Rules span every org the account installed on, so the scope picker offers all
// of them. An org entry (`acme/*`) binds a rule to one organization.
function scopeOptions(installations: { org: string; repos?: string[] }[]) {
  return [
    ...installations.map((i) => ({
      value: `${i.org}/*`,
      label: `${i.org}, all repositories`,
      group: "Organizations",
    })),
    ...installations.flatMap((i) =>
      (i.repos ?? []).map((repo) => ({ value: repo, label: repo, group: "Repositories" })),
    ),
  ]
}

export default async function RulesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const paging = parsePaging(await searchParams)
  const tenant = await resolveTenant(await pageMember())
  if (!tenant.current) return null
  if (!tenant.manages) redirect("/dashboard")

  const aiKeys = await aiKeyOptions(tenant.current.org)

  let rows: RuleRow[] = []
  let total = 0
  let loadError = false
  try {
    const all = (await resolveRules(tenant.current.installedBy)).sort((a, b) =>
      a.id.localeCompare(b.id),
    )
    const resolved = all.filter((rule) => rule.origin !== "catalog")
    const aiDocs = await db.aiRules()
      .find({ owner: tenant.current.installedBy })
      .toArray()
    const aiRows: RuleRow[] = aiDocs.flatMap((doc) => {
      const parsed = aiRuleSchema.safeParse(doc.body)
      if (!parsed.success) return []
      return [
        {
          id: parsed.data.id,
          ruleId: parsed.data.id,
          kind: "ai" as const,
          pack: null,
          origin: "custom" as const,
          body: parsed.data,
          enabled: doc.enabled,
          updatedAt: doc.updatedAt.toISOString(),
        },
      ]
    })

    const merged = [...resolved.map(serializeResolvedRule), ...aiRows].sort((a, b) =>
      a.ruleId.localeCompare(b.ruleId),
    )
    rows = merged.slice(paging.skip, paging.skip + paging.perPage)
    total = merged.length
  } catch {
    loadError = true
  }

  return (
    <RulesView
      initialRules={rows}
      catalog={catalogRules}
      catalogPacks={[...PACKS]}
      loadError={loadError}
      paging={{ ...paging, total, hasMore: paging.skip + rows.length < total }}
      scopeOptions={scopeOptions(tenant.installations)}
      aiKeys={aiKeys}
    />
  )
}
