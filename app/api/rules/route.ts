import { NextResponse } from "next/server"
import { memberScopes, requireUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { catalogById, PACKS } from "@/lib/rules/catalog"
import { resolveRules, serializeResolvedRule, upsertOverride } from "@/lib/rules"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { parsePaging } from "@/lib/paging"
import { withErrorHandler } from "@/lib/route"
import { resolveTenant } from "@/lib/tenant"
import { createRuleBody } from "@/schemas/api"

// Rules are owned by an account, not an org, so the caller's own installations.
async function requireRuleOwner(): Promise<{ owner: string; login: string }> {
  const user = await requireUser()
  const tenant = await resolveTenant(memberScopes(user))
  if (!tenant.current) throw new AppError("forbidden", "No Pushguard installation for this account")
  return { owner: tenant.current.installedBy, login: user.login }
}

export const GET = withErrorHandler("/api/rules", async (request) => {
  const { owner } = await requireRuleOwner()
  const url = new URL(request.url)
  const paging = parsePaging(url.searchParams)

  const all = await resolveRules(owner)

  const scope = url.searchParams.get("scope") === "all" ? "all" : "mine"
  let rules = scope === "all" ? all : all.filter((rule) => rule.origin !== "catalog")
  const pack = url.searchParams.get("pack")
  if (pack) rules = rules.filter((rule) => rule.pack === pack)
  rules.sort((a, b) => a.id.localeCompare(b.id))

  const page = rules.slice(paging.skip, paging.skip + paging.perPage)
  return NextResponse.json({
    data: page.map(serializeResolvedRule),
    scope,
    catalogActive: all.filter((rule) => rule.origin === "catalog" && rule.enabled).length,
    packs: PACKS.map((entry) => ({
      ...entry,
      rules: all.filter((rule) => rule.pack === entry.id).length,
    })),
    page: {
      number: paging.page,
      perPage: paging.perPage,
      total: rules.length,
      hasMore: paging.skip + page.length < rules.length,
    },
  })
})

export const POST = withErrorHandler("/api/rules", async (request) => {
  const { rule } = createRuleBody.parse(await request.json())
  const { owner, login } = await requireRuleOwner()

  if (catalogById.has(rule.id)) {
    throw new AppError(
      "validation_failed",
      `${rule.id} is a catalog rule. Edit it instead, or choose another id.`,
    )
  }
  if ((await resolveRules(owner)).some((existing) => existing.id === rule.id)) {
    throw new AppError("validation_failed", `Rule id already exists: ${rule.id}`)
  }

  await upsertOverride({ owner, ruleId: rule.id, body: rule, enabled: rule.enabled, by: login })
  await db.ruleVersions().insertOne({
    _id: crypto.randomUUID(),
    ruleId: rule.id,
    body: rule,
    action: "created",
    changedBy: login,
    changedAt: new Date(),
  })
  logger.info("rule_created", { owner, ruleId: rule.id, by: login })
  return NextResponse.json(
    { data: serializeResolvedRule({ ...rule, origin: "custom" }) },
    { status: 201 },
  )
})
