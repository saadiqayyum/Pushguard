import { NextResponse } from "next/server"
import { memberScopes, requireUser } from "@/lib/auth"
import { rulesCollection, ruleVersionsCollection, serializeRule, type RuleDoc } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { parsePaging } from "@/lib/paging"
import { withErrorHandler } from "@/lib/route"
import { resolveTenant } from "@/lib/tenant"
import { createRuleBody } from "@/schemas/api"

// Rules are owned by an account, not an org, so the caller's own installations
// decide which rule set they may touch. Membership of any org under that
// installation is the ACL, exactly as it is for per-org settings.
async function requireRuleOwner(): Promise<{ owner: string; login: string }> {
  const user = await requireUser()
  const tenant = await resolveTenant(memberScopes(user))
  if (!tenant.current) throw new AppError("forbidden", "No Pushguard installation for this account")
  return { owner: tenant.current.installedBy, login: user.login }
}

export const GET = withErrorHandler("/api/rules", async (request) => {
  const { owner } = await requireRuleOwner()
  const paging = parsePaging(new URL(request.url).searchParams)
  const rules = await rulesCollection()
  const [docs, total] = await Promise.all([
    rules.find({ owner }).sort({ ruleId: 1 }).skip(paging.skip).limit(paging.perPage).toArray(),
    rules.countDocuments({ owner }),
  ])
  return NextResponse.json({
    data: docs.map(serializeRule),
    page: {
      number: paging.page,
      perPage: paging.perPage,
      total,
      hasMore: paging.skip + docs.length < total,
    },
  })
})

export const POST = withErrorHandler("/api/rules", async (request) => {
  const { rule } = createRuleBody.parse(await request.json())
  const { owner, login } = await requireRuleOwner()
  const now = new Date()

  const doc: RuleDoc = {
    _id: crypto.randomUUID(),
    owner,
    ruleId: rule.id,
    body: rule,
    enabled: rule.enabled,
    createdBy: login,
    createdAt: now,
    updatedAt: now,
  }

  try {
    await (await rulesCollection()).insertOne(doc)
  } catch (error) {
    if (error instanceof Error && error.message.includes("E11000")) {
      throw new AppError("validation_failed", `Rule id already exists: ${rule.id}`)
    }
    throw error
  }

  await (await ruleVersionsCollection()).insertOne({
    _id: crypto.randomUUID(),
    ruleId: doc._id,
    body: rule,
    action: "created",
    changedBy: login,
    changedAt: now,
  })
  logger.info("rule_created", { owner, ruleId: rule.id, by: login })
  return NextResponse.json({ data: serializeRule(doc) }, { status: 201 })
})
