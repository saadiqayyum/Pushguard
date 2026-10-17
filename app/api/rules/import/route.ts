import { parse as parseYaml } from "yaml"
import { recordRuleVersion, ruleFor, rulesFor, saveRule } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { respond, userRoute } from "@/lib/route"
import { requireAdmin } from "@/lib/tenant"
import { importRulesBody, MAX_IMPORTED_RULES, MAX_RULES_PER_ORG } from "@/schemas/api"
import { importResultOut } from "@/schemas/output"
import { checkedRulesFileSchema } from "@/schemas/rule-safety"

// Regex safety checks may take seconds each; see schemas/rule-safety.ts.
export const maxDuration = 60

export const POST = userRoute("/api/rules/import", async (request) => {
  const { content } = importRulesBody.parse(await request.json())
  const { login, org } = await requireAdmin()

  let parsed: unknown
  try {
    parsed = parseYaml(content)
  } catch {
    throw new AppError("validation_failed", "Could not read the file as YAML or JSON")
  }
  const rules = await checkedRulesFileSchema.parseAsync(parsed)
  if (rules.length === 0) throw new AppError("validation_failed", "No rules in that file")
  if (rules.length > MAX_IMPORTED_RULES) {
    throw new AppError("validation_failed", `At most ${MAX_IMPORTED_RULES} rules per import`)
  }

  const stored = new Set((await rulesFor(org)).map((rule) => rule.ruleId))
  const adding = rules.filter((rule) => !stored.has(rule.id)).length
  if (stored.size + adding > MAX_RULES_PER_ORG) {
    throw new AppError("validation_failed", `This import would exceed ${MAX_RULES_PER_ORG} stored rules per organization`)
  }

  let created = 0
  for (const rule of rules) {
    const existing = await ruleFor(org, rule.id)
    await saveRule(org, rule.id, { body: rule, enabled: rule.enabled, createdBy: login })
    await recordRuleVersion({ org, ruleId: rule.id, body: rule, action: existing ? "updated" : "created", changedBy: login })
    if (!existing) created++
  }

  logger.info("rules_imported", { org, by: login, created, updated: rules.length - created })
  return respond(importResultOut, { created, updated: rules.length - created, total: rules.length })
})
