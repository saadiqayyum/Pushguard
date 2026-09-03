import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { withErrorHandler } from "@/lib/route"
import { requireManagedTenant } from "@/lib/tenant"
import { aiRuleSchema } from "@/schemas/ai-rule"


export const PATCH = withErrorHandler("/api/ai-rules/[id]", async (request, { params }) => {
  const { id } = await params
  const rule = aiRuleSchema.parse(await request.json())
  const { owner, login } = await requireManagedTenant()

  if (rule.id !== id) {
    throw new AppError("validation_failed", "Rule id cannot be changed; duplicate it instead")
  }

  const result = await db.aiRules().updateOne(
    { owner, ruleId: id },
    { $set: { body: rule, enabled: rule.enabled, updatedAt: new Date() } },
  )
  if (result.matchedCount === 0) throw new AppError("not_found", "Rule not found")

  logger.info("ai_rule_updated", { owner, ruleId: id, by: login })
  return NextResponse.json({ data: rule })
})

export const DELETE = withErrorHandler("/api/ai-rules/[id]", async (_request, { params }) => {
  const { id } = await params
  const { owner, login } = await requireManagedTenant()

  const result = await db.aiRules().deleteOne({ owner, ruleId: id })
  if (result.deletedCount === 0) throw new AppError("not_found", "Rule not found")

  logger.info("ai_rule_deleted", { owner, ruleId: id, by: login })
  return NextResponse.json({ data: null })
})
