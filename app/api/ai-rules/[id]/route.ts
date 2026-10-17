import { deleteAiRule, updateAiRule } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { respond, userRoute } from "@/lib/route"
import { requireAdmin } from "@/lib/tenant"
import { aiRuleSchema } from "@/schemas/ai-rule"
import { aiRuleOut, nothingOut } from "@/schemas/output"

export const PATCH = userRoute("/api/ai-rules/[id]", async (request, { params }) => {
  const { id } = await params
  const rule = aiRuleSchema.parse(await request.json())
  const { org, login } = await requireAdmin()
  if (rule.id !== id) throw new AppError("validation_failed", "Rule id cannot be changed; duplicate it instead")

  if (!(await updateAiRule(org, id, { body: rule, enabled: rule.enabled }))) {
    throw new AppError("not_found", "Rule not found")
  }
  logger.info("ai_rule_updated", { org, ruleId: id, by: login })
  return respond(aiRuleOut, rule)
})

export const DELETE = userRoute("/api/ai-rules/[id]", async (_request, { params }) => {
  const { id } = await params
  const { org, login } = await requireAdmin()
  if (!(await deleteAiRule(org, id))) throw new AppError("not_found", "Rule not found")
  logger.info("ai_rule_deleted", { org, ruleId: id, by: login })
  return respond(nothingOut, null)
})
