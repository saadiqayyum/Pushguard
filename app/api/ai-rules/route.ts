import { NextResponse } from "next/server"
import { memberScopes, requireUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { withErrorHandler } from "@/lib/route"
import { resolveTenant } from "@/lib/tenant"
import { aiRuleSchema, MAX_AI_RULES_PER_ACCOUNT } from "@/schemas/ai-rule"

async function requireOwner(): Promise<{ owner: string; login: string }> {
  const user = await requireUser()
  const tenant = await resolveTenant(memberScopes(user))
  if (!tenant.current) throw new AppError("forbidden", "No Pushguard installation for this account")
  return { owner: tenant.current.installedBy, login: user.login }
}

export const POST = withErrorHandler("/api/ai-rules", async (request) => {
  const rule = aiRuleSchema.parse(await request.json())
  const { owner, login } = await requireOwner()
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
