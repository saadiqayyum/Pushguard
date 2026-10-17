import { redirect } from "next/navigation"
import { RulesView } from "@/components/rules-view"
import type { RuleRow } from "@/components/rule-types"
import { activeInstallation, aiKeyOptions, aiRulesFor, disabledPacksFor, publishedCheckIds, withUser } from "@/lib/db"
import { logger } from "@/lib/logger"
import { resolveRules, serializeResolvedRule } from "@/lib/rules"
import { catalogRules, PACKS } from "@/lib/rules/catalog"
import { pageTenant } from "@/lib/tenant"
import { aiRuleSchema } from "@/schemas/ai-rule"

export const dynamic = "force-dynamic"

async function loadRules(org: string): Promise<RuleRow[]> {
  const [resolved, aiDocs] = await Promise.all([resolveRules(org), aiRulesFor(org)])
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
  return [...resolved.map(serializeResolvedRule), ...aiRows].sort(
    (a, b) => a.ruleId.localeCompare(b.ruleId),
  )
}

// Every rule on one page: the catalog is fixed-size and packs render collapsed.
export default async function RulesPage() {
  const view = await pageTenant()
  const current = view.current
  if (!current) return null
  if (!current.role) redirect("/dashboard")
  const admin = current.role === "admin"

  const data = await withUser(view.login, async () => {
    try {
      const [rules, disabledPacks, aiKeys, installation, checks] = await Promise.all([
        loadRules(current.org),
        disabledPacksFor(current.org),
        admin ? aiKeyOptions(current.org) : Promise.resolve([]),
        activeInstallation(current.org),
        publishedCheckIds(),
      ])
      return { rules, disabledPacks: [...disabledPacks], aiKeys, repos: installation?.repos ?? [], checks, error: false }
    } catch (error) {
      logger.error("rules_page_failed", { org: current.org, error: error instanceof Error ? error.message : String(error) })
      return { rules: [], disabledPacks: [], aiKeys: [], repos: [], checks: [], error: true }
    }
  })

  return (
    <RulesView
      initialRules={data.rules}
      disabledPacks={data.disabledPacks}
      catalogOff={catalogRules.filter((rule) => !rule.enabled).map((rule) => rule.id)}
      catalogPacks={[...PACKS]}
      loadError={data.error}
      readOnly={!admin}
      scopeOptions={[
        { value: `${current.org}/*`, label: `${current.org}, all repositories`, group: "Organization" },
        ...data.repos.map((repo) => ({ value: repo, label: repo, group: "Repositories" })),
      ]}
      aiKeys={data.aiKeys}
      checks={data.checks}
    />
  )
}
