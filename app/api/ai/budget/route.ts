import { aiUsageToday, updateInstallation } from "@/lib/db"
import { clampLimit } from "@/lib/ai-budget"
import { logger } from "@/lib/logger"
import { respond, userRoute } from "@/lib/route"
import { requireAdmin } from "@/lib/tenant"
import { aiBudgetBody } from "@/schemas/api"
import { aiBudgetOut } from "@/schemas/output"

export const PATCH = userRoute("/api/ai/budget", async (request) => {
  const body = aiBudgetBody.parse(await request.json())
  const { org, login } = await requireAdmin()

  await updateInstallation(org, { aiDailyTokenBudget: body.dailyTokenBudget, aiPushTokenBudget: body.pushTokenBudget })
  logger.info("ai_budget_set", { org, by: login, daily: body.dailyTokenBudget, push: body.pushTokenBudget })
  return respond(aiBudgetOut, {
    dailyTokenBudget: clampLimit("dailyTokenBudget", body.dailyTokenBudget),
    pushTokenBudget: clampLimit("pushTokenBudget", body.pushTokenBudget),
    usage: await aiUsageToday(org),
  })
})
