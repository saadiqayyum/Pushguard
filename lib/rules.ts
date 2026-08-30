import { disabledPacksFor, rulesCollection } from "@/lib/db"
import { catalogById, catalogRules } from "@/lib/rules/catalog"
import { logger } from "@/lib/logger"
import { ruleSchema, type Rule } from "@/schemas/rule"

export type ResolvedRule = Rule & {
  /** Where this rule came from, for a UI that has to explain itself. */
  origin: "catalog" | "modified" | "custom"
}

/**
 * The rule set an account is actually evaluated against: the catalog, with
 * whatever they changed layered on top.
 *
 * The catalog used to be copied into the database for every account at install.
 * That meant one identical document per rule per account, an improvement to a
 * rule that could never reach anybody already installed, and a rule set that
 * could not be read without a database. Now the file is the rule set and the
 * database holds only differences: an override of a catalog rule, or a rule
 * somebody wrote themselves.
 *
 * An override wins by id, whole. It is stored as a complete rule rather than a
 * patch because a rule is small and a stored patch would have to be re-applied
 * against a catalog entry that has since changed, which is how a rule ends up
 * meaning something nobody chose.
 *
 * Read on every push, deliberately, with no cache. This was a 60-second
 * in-memory cache once: it bought one indexed Mongo query and cost a staleness
 * window, because invalidation only reached the instance that handled the
 * write. On any multi-instance deploy a rule somebody disabled, because it was
 * firing wrongly, kept firing everywhere else for up to a minute. That is the
 * wrong trade for a tool that files tickets naming an account.
 */
export async function resolveRules(owner: string): Promise<ResolvedRule[]> {
  const [docs, disabledPacks] = await Promise.all([
    (await rulesCollection()).find({ owner }).toArray(),
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
    // `enabled` is read from the document, not the body: toggling a rule off is
    // the most common override there is, and it must not depend on whoever
    // wrote the body remembering to keep the two in step.
    resolved.set(doc.ruleId, {
      ...parsed.data,
      enabled: doc.enabled,
      origin: catalogById.has(doc.ruleId) ? "modified" : "custom",
    })
  }

  return [...resolved.values()]
}

/** What the engine runs. Same resolution, minus everything switched off. */
export async function getActiveRules(owner: string): Promise<Rule[]> {
  return (await resolveRules(owner)).filter((rule) => rule.enabled)
}

/**
 * The wire shape. `id` is the rule id, not a database id, because most rules
 * do not have a database row at all until somebody changes one. Everything
 * addresses a rule by the name it is known by.
 */
export function serializeResolvedRule(rule: ResolvedRule) {
  return {
    id: rule.id,
    ruleId: rule.id,
    pack: rule.pack ?? null,
    origin: rule.origin,
    body: rule,
    enabled: rule.enabled,
    updatedAt: null as string | null,
  }
}

/**
 * Write an override for a catalog rule, or update one that already exists.
 *
 * There is no row to update until this runs. A catalog rule lives in a file, so
 * the first time anybody edits or disables one, the override is created here.
 */
export async function upsertOverride(input: {
  owner: string
  ruleId: string
  body: Rule
  enabled: boolean
  by: string
}): Promise<void> {
  const now = new Date()
  await (await rulesCollection()).updateOne(
    { owner: input.owner, ruleId: input.ruleId },
    {
      $set: { body: input.body, enabled: input.enabled, updatedAt: now },
      $setOnInsert: { _id: crypto.randomUUID(), createdBy: input.by, createdAt: now },
    },
    { upsert: true },
  )
}

/**
 * Drop an override so the catalog rule applies again.
 *
 * Returns false for a rule that has no override, which for a custom rule means
 * it never existed and for a catalog rule means it was never changed. Both are
 * already in the state the caller asked for.
 */
export async function clearOverride(owner: string, ruleId: string): Promise<boolean> {
  const result = await (await rulesCollection()).deleteOne({ owner, ruleId })
  return result.deletedCount > 0
}
