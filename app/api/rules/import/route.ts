import { NextResponse } from "next/server"
import { parse as parseYaml } from "yaml"
import { memberScopes, requireUser } from "@/lib/auth"
import { db, type RuleDoc } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { withErrorHandler } from "@/lib/route"
import { resolveTenant } from "@/lib/tenant"
import { importRulesBody } from "@/schemas/api"
import { checkedRulesFileSchema } from "@/schemas/rule-safety"

// Bulk import, YAML or JSON.
export const POST = withErrorHandler("/api/rules/import", async (request) => {
  const { content } = importRulesBody.parse(await request.json())
  const user = await requireUser()
  const tenant = await resolveTenant(memberScopes(user))
  if (!tenant.current) throw new AppError("forbidden", "No Pushguard installation for this account")
  const owner = tenant.current.installedBy

  let parsed: unknown
  try {
    parsed = parseYaml(content)
  } catch (error) {
    throw new AppError("validation_failed", `Could not read the file: ${(error as Error).message}`)
  }

  const rules = checkedRulesFileSchema.parse(parsed)
  if (rules.length === 0) throw new AppError("validation_failed", "No rules in that file")

  const versions = db.ruleVersions()
  const now = new Date()
  let created = 0
  let updated = 0

  for (const rule of rules) {
    const existing = await db.rules().findOne({ owner, ruleId: rule.id })
    const _id = existing?._id ?? crypto.randomUUID()

    const doc: RuleDoc = {
      _id,
      owner,
      ruleId: rule.id,
      body: rule,
      enabled: rule.enabled,
      createdBy: existing?.createdBy ?? user.login,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await db.rules().replaceOne({ _id }, doc, { upsert: true })
    await versions.insertOne({
      _id: crypto.randomUUID(),
      ruleId: _id,
      body: rule,
      action: existing ? "updated" : "created",
      changedBy: user.login,
      changedAt: now,
    })
    if (existing) updated++
    else created++
  }

  logger.info("rules_imported", { owner, by: user.login, created, updated })
  return NextResponse.json({ data: { created, updated, total: rules.length } })
})
