import { redirect } from "next/navigation"
import { RulesView } from "@/components/rules-view"
import type { RuleRow } from "@/components/rule-types"
import { auth, memberScopes } from "@/lib/auth"
import { resolveRules, serializeResolvedRule } from "@/lib/rules"
import { catalogRules, PACKS } from "@/lib/rules/catalog"
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
  const session = await auth()
  if (!session?.user) redirect("/signin")

  const tenant = await resolveTenant(memberScopes({ login: session.login ?? "", orgs: session.orgs ?? [] }))
  if (!tenant.current) return null

  let rows: RuleRow[] = []
  let total = 0
  let catalogActive = 0
  let loadError = false
  try {
    // The catalog plus this account's changes, not the collection: querying the
    // table would show only the rules somebody has edited.
    const all = (await resolveRules(tenant.current.installedBy)).sort((a, b) =>
      a.id.localeCompare(b.id),
    )
    // Only what this account wrote or changed. The catalog is active either
    // way, and putting all 76 rows here hid the few that are actually theirs.
    const resolved = all.filter((rule) => rule.origin !== "catalog")
    rows = resolved.slice(paging.skip, paging.skip + paging.perPage).map(serializeResolvedRule)
    total = resolved.length
    catalogActive = all.filter((rule) => rule.origin === "catalog" && rule.enabled).length
  } catch {
    loadError = true
  }

  return (
    <RulesView
      orgs={tenant.installations.map((i) => i.org)}
      initialRules={rows}
      catalog={catalogRules}
      catalogPacks={[...PACKS]}
      catalogActive={catalogActive}
      loadError={loadError}
      paging={{ ...paging, total, hasMore: paging.skip + rows.length < total }}
      scopeOptions={scopeOptions(tenant.installations)}
    />
  )
}
