import { aiRuleFor, countAiRules, insertAiRule } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { respond, userRoute } from "@/lib/route"
import { requireAdmin } from "@/lib/tenant"
import { aiRuleSchema, MAX_AI_RULES_PER_ACCOUNT } from "@/schemas/ai-rule"
import { aiRuleOut } from "@/schemas/output"

export const POST = userRoute("/api/ai-rules", async (request) => {
  const rule = aiRuleSchema.parse(await request.json())
  const { org, login } = await requireAdmin()

  if (await aiRuleFor(org, rule.id)) throw new AppError("validation_failed", `Rule id already exists: ${rule.id}`)
  if ((await countAiRules(org)) >= MAX_AI_RULES_PER_ACCOUNT) {
    throw new AppError("validation_failed", `At most ${MAX_AI_RULES_PER_ACCOUNT} AI rules. Delete one first.`)
  }

  await insertAiRule({ org, ruleId: rule.id, body: rule, enabled: rule.enabled, createdBy: login })
  logger.info("ai_rule_created", { org, ruleId: rule.id, by: login, scope: rule.scope })
  return respond(aiRuleOut, rule, { status: 201 })
})
