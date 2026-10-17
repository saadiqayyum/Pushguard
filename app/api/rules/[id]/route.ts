import { deleteRule, recordRuleVersion, saveRule } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { resolveRules, serializeResolvedRule } from "@/lib/rules"
import { respond, userRoute } from "@/lib/route"
import { requireAdmin } from "@/lib/tenant"
import { updateRuleBody } from "@/schemas/api"
import { ruleSchema } from "@/schemas/rule"
import { ruleRowOut } from "@/schemas/output"

// Regex safety checks may take seconds each; see schemas/rule-safety.ts.
export const maxDuration = 60

export const PATCH = userRoute("/api/rules/[id]", async (request, { params }) => {
  const { id } = await params
  const body = await updateRuleBody.parseAsync(await request.json())
  const { org, login } = await requireAdmin()

  const current = (await resolveRules(org)).find((rule) => rule.id === id)
  if (!current) throw new AppError("not_found", "Rule not found")
  if (body.rule && body.rule.id !== id) {
    throw new AppError("validation_failed", "Rule id cannot be changed; duplicate it instead")
  }

  const { origin, ...currentBody } = current
  const nextBody = body.rule ?? currentBody
  const enabled = body.enabled ?? current.enabled
  const action = body.rule ? "updated" : enabled ? "enabled" : "disabled"

  await saveRule(org, id, { body: nextBody, enabled, createdBy: login })
  await recordRuleVersion({ org, ruleId: id, body: nextBody, action, changedBy: login })
  logger.info("rule_changed", { org, ruleId: id, action, by: login, wasFrom: origin })

  return respond(
    ruleRowOut,
    serializeResolvedRule({ ...nextBody, enabled, origin: origin === "custom" ? "custom" : "modified" }),
  )
})

// Undo a change. For a rule somebody wrote, the override is the rule.
export const DELETE = userRoute("/api/rules/[id]", async (_request, { params }) => {
  const { id } = await params
  const { org, login } = await requireAdmin()

  if (!(await deleteRule(org, id))) throw new AppError("not_found", "No change to undo for that rule")
  const restored = (await resolveRules(org)).find((rule) => rule.id === id)
  await recordRuleVersion({
    org,
    ruleId: id,
    body: restored ? ruleSchema.strip().parse(restored) : null,
    action: restored ? "reverted" : "deleted",
    changedBy: login,
  })
  logger.info("rule_override_cleared", { org, ruleId: id, by: login, catalog: Boolean(restored) })

  return respond(ruleRowOut.nullable(), restored ? serializeResolvedRule(restored) : null)
})
