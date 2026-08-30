import { redirect } from "next/navigation"
import { RulesView } from "@/components/rules-view"
import type { RuleRow } from "@/components/rule-types"
import { auth, memberScopes } from "@/lib/auth"
import { rulesCollection, serializeRule } from "@/lib/db"
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
  let loadError = false
  try {
    const rules = await rulesCollection()
    const owner = tenant.current.installedBy
    const [docs, count] = await Promise.all([
      rules.find({ owner }).sort({ ruleId: 1 }).skip(paging.skip).limit(paging.perPage).toArray(),
      rules.countDocuments({ owner }),
    ])
    rows = docs.map(serializeRule)
    total = count
  } catch {
    loadError = true
  }

  return (
    <RulesView
      orgs={tenant.installations.map((i) => i.org)}
      initialRules={rows}
      loadError={loadError}
      paging={{ ...paging, total, hasMore: paging.skip + rows.length < total }}
      scopeOptions={scopeOptions(tenant.installations)}
    />
  )
}
