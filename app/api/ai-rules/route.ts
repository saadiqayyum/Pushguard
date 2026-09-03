import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { withErrorHandler } from "@/lib/route"
import { requireManagedTenant } from "@/lib/tenant"
import { aiRuleSchema, MAX_AI_RULES_PER_ACCOUNT } from "@/schemas/ai-rule"


export const POST = withErrorHandler("/api/ai-rules", async (request) => {
  const rule = aiRuleSchema.parse(await request.json())
  const { owner, login } = await requireManagedTenant()
  const now = new Date()

  const existing = await db.aiRules().findOne({ owner, ruleId: rule.id })
  if (existing) throw new AppError("validation_failed", `Rule id already exists: ${rule.id}`)

  const stored = await db.aiRules().countDocuments({ owner })
  if (stored >= MAX_AI_RULES_PER_ACCOUNT) {
    throw new AppError(
      "validation_failed",
      `An account may store ${MAX_AI_RULES_PER_ACCOUNT} AI rules. Delete one before adding another.`,
    )
  }

  await db.aiRules().insertOne({
    _id: crypto.randomUUID(),
    owner,
    ruleId: rule.id,
    body: rule,
    enabled: rule.enabled,
    createdBy: login,
    createdAt: now,
    updatedAt: now,
  })
  logger.info("ai_rule_created", { owner, ruleId: rule.id, by: login, scope: rule.scope })
  return NextResponse.json({ data: rule }, { status: 201 })
})
