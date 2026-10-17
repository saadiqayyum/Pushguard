import { countRules, recordRuleVersion, ruleFor, saveRule } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { parsePaging } from "@/lib/paging"
import { resolveRules, serializeResolvedRule } from "@/lib/rules"
import { catalogById, PACKS } from "@/lib/rules/catalog"
import { respond, userRoute } from "@/lib/route"
import { requireAdmin, requireTenant } from "@/lib/tenant"
import { createRuleBody, MAX_RULES_PER_ORG } from "@/schemas/api"
import { ruleRowOut, rulesListOut } from "@/schemas/output"

// Regex safety checks may take seconds each; see schemas/rule-safety.ts.
export const maxDuration = 60

export const GET = userRoute("/api/rules", async (request) => {
  const { org } = await requireTenant()
  const url = new URL(request.url)
  const paging = parsePaging(url.searchParams)
  const all = await resolveRules(org)

  const scope = url.searchParams.get("scope") === "all" ? "all" : "mine"
  const pack = url.searchParams.get("pack")
  const rules = all
    .filter((rule) => (scope === "all" || rule.origin !== "catalog") && (!pack || rule.pack === pack))
    .sort((a, b) => a.id.localeCompare(b.id))
  const page = rules.slice(paging.skip, paging.skip + paging.perPage)

  return respond(rulesListOut, {
    rules: page.map(serializeResolvedRule),
    scope,
    catalogActive: all.filter((rule) => rule.origin === "catalog" && rule.enabled).length,
    packs: PACKS.map((entry) => ({ ...entry, rules: all.filter((rule) => rule.pack === entry.id).length })),
    page: { number: paging.page, perPage: paging.perPage, total: rules.length, hasMore: paging.skip + page.length < rules.length },
  })
})

export const POST = userRoute("/api/rules", async (request) => {
  const { rule } = await createRuleBody.parseAsync(await request.json())
  const { org, login } = await requireAdmin()

  if (catalogById.has(rule.id)) {
    throw new AppError("validation_failed", `${rule.id} is a catalog rule. Edit it instead, or choose another id.`)
  }
  if (await ruleFor(org, rule.id)) throw new AppError("validation_failed", `Rule id already exists: ${rule.id}`)
  if ((await countRules(org)) >= MAX_RULES_PER_ORG) {
    throw new AppError("validation_failed", `At most ${MAX_RULES_PER_ORG} stored rules per organization`)
  }

  await saveRule(org, rule.id, { body: rule, enabled: rule.enabled, createdBy: login })
  await recordRuleVersion({ org, ruleId: rule.id, body: rule, action: "created", changedBy: login })
  logger.info("rule_created", { org, ruleId: rule.id, by: login })
  return respond(ruleRowOut, serializeResolvedRule({ ...rule, origin: "custom" }), { status: 201 })
})
