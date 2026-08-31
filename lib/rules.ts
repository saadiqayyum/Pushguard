import { db, disabledPacksFor } from "@/lib/db"
import { catalogById, catalogRules } from "@/lib/rules/catalog"
import { logger } from "@/lib/logger"
import { ruleSchema, type Rule } from "@/schemas/rule"

export type ResolvedRule = Rule & {
  origin: "catalog" | "modified" | "custom"
}

// The rule set an account is actually evaluated against: the catalog, with
// whatever they changed layered on top.
export async function resolveRules(owner: string): Promise<ResolvedRule[]> {
  const [docs, disabledPacks] = await Promise.all([
    db.rules().find({ owner }).toArray(),
    disabledPacksFor(owner),
  ])

  const resolved = new Map<string, ResolvedRule>()
  for (const rule of catalogRules) {
    const packOff = rule.pack !== undefined && disabledPacks.has(rule.pack)
    resolved.set(rule.id, {
      ...rule,
      enabled: rule.enabled && !packOff,
      origin: "catalog",
    })
  }

  for (const doc of docs) {
    const parsed = ruleSchema.safeParse(doc.body)
    if (!parsed.success) {
      logger.warn("rule_skipped_invalid", { ruleId: doc.ruleId, issues: parsed.error.issues.length })
      continue
    }
    resolved.set(doc.ruleId, {
      ...parsed.data,
      enabled: doc.enabled,
      origin: catalogById.has(doc.ruleId) ? "modified" : "custom",
    })
  }

  return [...resolved.values()]
}

// What the engine runs. Same resolution, minus everything switched off.
export async function getActiveRules(owner: string): Promise<Rule[]> {
  return (await resolveRules(owner)).filter((rule) => rule.enabled)
}

// The wire shape. `id` is the rule id, not a database id, because most rules.
export function serializeResolvedRule(rule: ResolvedRule) {
  return {
    id: rule.id,
    ruleId: rule.id,
    kind: "pattern" as const,
    pack: rule.pack ?? null,
    origin: rule.origin,
    body: rule,
    enabled: rule.enabled,
    updatedAt: null as string | null,
  }
}

// Write an override for a catalog rule, or update one that already exists.
export async function upsertOverride(input: {
  owner: string
  ruleId: string
  body: Rule
  enabled: boolean
  by: string
}): Promise<void> {
  const now = new Date()
  await db.rules().updateOne(
    { owner: input.owner, ruleId: input.ruleId },
    {
      $set: { body: input.body, enabled: input.enabled, updatedAt: now },
      $setOnInsert: { _id: crypto.randomUUID(), createdBy: input.by, createdAt: now },
    },
    { upsert: true },
  )
}

// Drop an override so the catalog rule applies again.
export async function clearOverride(owner: string, ruleId: string): Promise<boolean> {
  const result = await db.rules().deleteOne({ owner, ruleId })
  return result.deletedCount > 0
}
