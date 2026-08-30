import { NextResponse } from "next/server"
import { memberScopes, requireUser } from "@/lib/auth"
import { ruleVersionsCollection } from "@/lib/db"
import { catalogById, PACKS } from "@/lib/rules/catalog"
import { resolveRules, serializeResolvedRule, upsertOverride } from "@/lib/rules"
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
  const url = new URL(request.url)
  const paging = parsePaging(url.searchParams)

  // Resolved, not read from the collection. Most rules live in the catalog and
  // have no row, so querying the table would list only what somebody changed.
  const all = await resolveRules(owner)

  // `mine` by default: the catalog is 76 rules and returning every one of them
  // buries the handful somebody actually wrote or changed. They are all still
  // active, which is what `catalogActive` reports. `scope=all` is for callers
  // that want the whole resolved set; the dashboard browses the catalog in a
  // picker instead of paging through it.
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

  // A custom rule may not take a catalog rule's name. It would not replace it,
  // it would *become* an override of it, and the author would have silently
  // edited a shipped rule while believing they wrote a new one.
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
  await (await ruleVersionsCollection()).insertOne({
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
