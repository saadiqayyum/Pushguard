import { NextResponse } from "next/server"
import { memberScopes, requireUser } from "@/lib/auth"
import { rulesCollection, ruleVersionsCollection, serializeRule } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { notifyRuleChange } from "@/lib/rule-notify"
import { invalidateRulesCache } from "@/lib/rules"
import { withErrorHandler } from "@/lib/route"
import { resolveTenant } from "@/lib/tenant"
import { updateRuleBody } from "@/schemas/api"

export const PATCH = withErrorHandler("/api/rules/[id]", async (request, { params }) => {
  const { id } = await params
  const body = updateRuleBody.parse(await request.json())

  const collection = await rulesCollection()
  const existing = await collection.findOne({ _id: id })
  if (!existing) throw new AppError("not_found", "Rule not found")

  // The rule set belongs to an account; only someone whose own installation
  // resolves to that same owner may change it.
  const user = await requireUser()
  const tenant = await resolveTenant(memberScopes(user))
  if (tenant.current?.installedBy !== existing.owner) {
    throw new AppError("forbidden", "Rule belongs to another account")
  }

  // ruleId is the stable key the unique index and dedup rely on; a body whose
  // id no longer matches it would silently desync the two.
  if (body.rule && body.rule.id !== existing.ruleId) {
    throw new AppError("validation_failed", "Rule id cannot be changed; duplicate it instead")
  }

  const nextBody = body.rule ?? existing.body
  const nextEnabled = body.enabled ?? existing.enabled
  const action = body.rule ? "updated" : nextEnabled ? "enabled" : "disabled"
  const now = new Date()

  await collection.updateOne(
    { _id: id },
    { $set: { body: nextBody, enabled: nextEnabled, updatedAt: now } },
  )

  await (await ruleVersionsCollection()).insertOne({
    _id: crypto.randomUUID(),
    ruleId: id,
    body: nextBody,
    action,
    changedBy: user.login,
    changedAt: now,
  })

  invalidateRulesCache(existing.owner)
  notifyRuleChange(existing.owner, action, existing.ruleId, user.login)
  logger.info("rule_changed", { owner: existing.owner, ruleId: existing.ruleId, action, by: user.login })
  return NextResponse.json({
    data: serializeRule({ ...existing, body: nextBody, enabled: nextEnabled, updatedAt: now }),
  })
})
