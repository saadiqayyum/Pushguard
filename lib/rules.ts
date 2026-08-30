import { rulesCollection, ruleVersionsCollection } from "@/lib/db"
import { defaultRules } from "@/lib/default-rules"
import { logger } from "@/lib/logger"
import { ruleSchema, type Rule } from "@/schemas/rule"

// Read every time, on purpose. This was a 60-second in-memory cache, which
// bought one indexed Mongo query and cost a staleness window: invalidation only
// reached the instance that handled the write, so on any multi-instance deploy a
// rule somebody disabled. Because it was firing wrongly, kept firing for up to
// a minute everywhere else. That is the wrong trade for a tool that files
// tickets naming an account.
export async function getActiveRules(owner: string): Promise<Rule[]> {
  const docs = await (await rulesCollection()).find({ owner, enabled: true }).toArray()

  const parsed: Rule[] = []
  for (const doc of docs) {
    const result = ruleSchema.safeParse(doc.body)
    if (result.success) parsed.push(result.data)
    else logger.warn("rule_skipped_invalid", { ruleId: doc.ruleId, issues: result.error.issues.length })
  }

  return parsed
}

// Give every new account a working rule set. Only runs when the owner has no
// rules at all, so it never resurrects rules someone deliberately deleted and is
// safe to call from both the installation webhook and the self-registration
// fallback. No rule-change notifications: that would file one issue per rule.
export async function seedDefaultRules(owner: string, by: string): Promise<number> {
  const rules = await rulesCollection()
  if ((await rules.countDocuments({ owner }, { limit: 1 })) > 0) return 0

  const now = new Date()
  const docs = defaultRules.map((rule) => ({
    _id: crypto.randomUUID(),
    owner,
    ruleId: rule.id,
    body: rule,
    enabled: rule.enabled,
    createdBy: by,
    createdAt: now,
    updatedAt: now,
  }))

  try {
    // ordered:false so a racing duplicate install does not abort the rest; the
    // unique {owner, ruleId} index is what makes that safe.
    await rules.insertMany(docs, { ordered: false })
  } catch (error) {
    logger.warn("default_rules_partial_insert", {
      owner,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  await (await ruleVersionsCollection()).insertMany(
    docs.map((doc) => ({
      _id: crypto.randomUUID(),
      ruleId: doc._id,
      body: doc.body,
      action: "created" as const,
      changedBy: by,
      changedAt: now,
    })),
    { ordered: false },
  )
  logger.info("default_rules_seeded", { owner, count: docs.length })
  return docs.length
}
