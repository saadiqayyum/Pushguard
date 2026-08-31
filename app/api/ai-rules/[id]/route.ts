import { NextResponse } from "next/server"
import { memberScopes, requireUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { withErrorHandler } from "@/lib/route"
import { resolveTenant } from "@/lib/tenant"
import { aiRuleSchema } from "@/schemas/ai-rule"

async function requireOwner(): Promise<{ owner: string; login: string }> {
  const user = await requireUser()
  const tenant = await resolveTenant(memberScopes(user))
  if (!tenant.current) throw new AppError("forbidden", "No Pushguard installation for this account")
  return { owner: tenant.current.installedBy, login: user.login }
}

export const PATCH = withErrorHandler("/api/ai-rules/[id]", async (request, { params }) => {
  const { id } = await params
  const rule = aiRuleSchema.parse(await request.json())
  const { owner, login } = await requireOwner()

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
  const { owner, login } = await requireOwner()

  const result = await db.aiRules().deleteOne({ owner, ruleId: id })
  if (result.deletedCount === 0) throw new AppError("not_found", "Rule not found")

  logger.info("ai_rule_deleted", { owner, ruleId: id, by: login })
  return NextResponse.json({ data: null })
})
