import { NextResponse } from "next/server"
import { memberScopes, requireUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { catalogById } from "@/lib/rules/catalog"
import { clearOverride, resolveRules, serializeResolvedRule, upsertOverride } from "@/lib/rules"
import { withErrorHandler } from "@/lib/route"
import { resolveTenant } from "@/lib/tenant"
import { updateRuleBody } from "@/schemas/api"

// `id` here is the rule's own id, not a database id. Most rules live in the.
async function requireRuleOwner(): Promise<{ owner: string; login: string }> {
  const user = await requireUser()
  const tenant = await resolveTenant(memberScopes(user))
  if (!tenant.current) throw new AppError("forbidden", "No Pushguard installation for this account")
  return { owner: tenant.current.installedBy, login: user.login }
}

export const PATCH = withErrorHandler("/api/rules/[id]", async (request, { params }) => {
  const { id } = await params
  const body = updateRuleBody.parse(await request.json())
  const { owner, login } = await requireRuleOwner()

  const current = (await resolveRules(owner)).find((rule) => rule.id === id)
  if (!current) throw new AppError("not_found", "Rule not found")

  if (body.rule && body.rule.id !== id) {
    throw new AppError("validation_failed", "Rule id cannot be changed; duplicate it instead")
  }

  const { origin, ...currentBody } = current
  const nextBody = body.rule ?? currentBody
  const nextEnabled = body.enabled ?? current.enabled
  const action = body.rule ? "updated" : nextEnabled ? "enabled" : "disabled"

  await upsertOverride({ owner, ruleId: id, body: nextBody, enabled: nextEnabled, by: login })
  await db.ruleVersions().insertOne({
    _id: crypto.randomUUID(),
    ruleId: id,
    body: nextBody,
    action,
    changedBy: login,
    changedAt: new Date(),
  })
  logger.info("rule_changed", { owner, ruleId: id, action, by: login, wasFrom: origin })

  return NextResponse.json({
    data: serializeResolvedRule({
      ...nextBody,
      enabled: nextEnabled,
      origin: catalogById.has(id) ? "modified" : "custom",
    }),
  })
})

// Undo a change, rather than delete a rule.
// For a rule somebody wrote, the override *is* the rule and this removes it.
export const DELETE = withErrorHandler("/api/rules/[id]", async (_request, { params }) => {
  const { id } = await params
  const { owner, login } = await requireRuleOwner()

  const cleared = await clearOverride(owner, id)
  if (!cleared) throw new AppError("not_found", "No change to undo for that rule")

  await db.ruleVersions().insertOne({
    _id: crypto.randomUUID(),
    ruleId: id,
    body: catalogById.get(id) ?? null,
    action: catalogById.has(id) ? "reverted" : "deleted",
    changedBy: login,
    changedAt: new Date(),
  })
  logger.info("rule_override_cleared", { owner, ruleId: id, by: login, catalog: catalogById.has(id) })

  const restored = catalogById.get(id)
  return NextResponse.json({
    data: restored ? serializeResolvedRule({ ...restored, origin: "catalog" }) : null,
  })
})
