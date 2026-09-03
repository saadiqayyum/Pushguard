import { NextResponse } from "next/server"
import { parse as parseYaml } from "yaml"
import { db, type RuleDoc } from "@/lib/db"
import { logger } from "@/lib/logger"
import { AppError } from "@/lib/errors"
import { withErrorHandler } from "@/lib/route"
import { requireManagedTenant } from "@/lib/tenant"
import { importRulesBody } from "@/schemas/api"
import { checkedRulesFileSchema } from "@/schemas/rule-safety"

// Bulk import, YAML or JSON.
export const POST = withErrorHandler("/api/rules/import", async (request) => {
  const { content } = importRulesBody.parse(await request.json())
  const { login, owner } = await requireManagedTenant()

  let parsed: unknown
  try {
    parsed = parseYaml(content)
  } catch (error) {
    throw new AppError("validation_failed", `Could not read the file: ${(error as Error).message}`)
  }

  const rules = await checkedRulesFileSchema.parseAsync(parsed)
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
      createdBy: existing?.createdBy ?? login,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await db.rules().replaceOne({ _id }, doc, { upsert: true })
    await versions.insertOne({
      _id: crypto.randomUUID(),
      ruleId: _id,
      body: rule,
      action: existing ? "updated" : "created",
      changedBy: login,
      changedAt: now,
    })
    if (existing) updated++
    else created++
  }

  logger.info("rules_imported", { owner, by: login, created, updated })
  return NextResponse.json({ data: { created, updated, total: rules.length } })
})
