import { NextResponse } from "next/server"
import { parse as parseYaml } from "yaml"
import { memberScopes, requireUser } from "@/lib/auth"
import { rulesCollection, ruleVersionsCollection, type RuleDoc } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { withErrorHandler } from "@/lib/route"
import { resolveTenant } from "@/lib/tenant"
import { importRulesBody } from "@/schemas/api"
import { checkedRulesFileSchema } from "@/schemas/rule-safety"

/**
 * Bulk import, YAML or JSON.
 *
 * The same `checkedRulesFileSchema` the repository's own `rules.example.yaml` is
 * validated against, so a file generated elsewhere is held to exactly the
 * documented contract: a bad regex or an unknown field is refused here rather
 * than failing silently on the next push.
 *
 * Existing ids are updated rather than duplicated, and every write leaves a
 * version row, so an import is as reversible and as auditable as an edit made
 * by hand.
 */
export const POST = withErrorHandler("/api/rules/import", async (request) => {
  const { content } = importRulesBody.parse(await request.json())
  const user = await requireUser()
  const tenant = await resolveTenant(memberScopes(user))
  if (!tenant.current) throw new AppError("forbidden", "No Pushguard installation for this account")
  const owner = tenant.current.installedBy

  // JSON is a subset of YAML, so one parser reads both. A parse error is the
  // author's, not ours: say which line rather than "invalid".
  let parsed: unknown
  try {
    parsed = parseYaml(content)
  } catch (error) {
    throw new AppError("validation_failed", `Could not read the file: ${(error as Error).message}`)
  }

  const rules = checkedRulesFileSchema.parse(parsed)
  if (rules.length === 0) throw new AppError("validation_failed", "No rules in that file")

  const collection = await rulesCollection()
  const versions = await ruleVersionsCollection()
  const now = new Date()
  let created = 0
  let updated = 0

  for (const rule of rules) {
    const existing = await collection.findOne({ owner, ruleId: rule.id })
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
    await collection.replaceOne({ _id }, doc, { upsert: true })
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

  // Deliberately no per-rule notification issue: importing twenty rules would
  // file twenty tickets. The version rows are the audit trail.
  logger.info("rules_imported", { owner, by: user.login, created, updated })
  return NextResponse.json({ data: { created, updated, total: rules.length } })
})
