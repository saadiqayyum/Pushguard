import { disabledPacksFor, rulesFor } from "@/lib/db"
import { catalogRules } from "@/lib/rules/catalog"
import { logger } from "@/lib/logger"
import { staffRules, type ShadowRule, type StaffRules } from "@/lib/platform/staff-rules"
import { ruleSchema, type Rule } from "@/schemas/rule"

export type ResolvedRule = Rule & {
  origin: "catalog" | "modified" | "custom"
}

// The rule set an account is actually evaluated against: the catalog, rules
// staff published or changed, then whatever the account changed layered on top.
export async function resolveRules(org: string, preloaded?: StaffRules): Promise<ResolvedRule[]> {
  const [docs, disabledPacks, staff] = await Promise.all([rulesFor(org), disabledPacksFor(org), preloaded ?? staffRules(org)])

  const resolved = new Map<string, ResolvedRule>()
  for (const rule of [...catalogRules.filter((r) => !staff.live.has(r.id)), ...staff.live.values()]) {
    const packOff = rule.pack !== undefined && disabledPacks.has(rule.pack)
    resolved.set(rule.id, { ...rule, enabled: rule.enabled && !packOff, origin: "catalog" })
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
      origin: resolved.has(doc.ruleId) ? "modified" : "custom",
    })
  }

  return [...resolved.values()]
}

// What the engine runs. Same resolution, minus everything switched off.
export async function getActiveRules(org: string): Promise<Rule[]> {
  return (await resolveRules(org)).filter((rule) => rule.enabled)
}

// A push also measures staff shadow versions, unless the account changed or
// switched off that rule.
export async function pushRules(org: string): Promise<{ active: Rule[]; shadow: ShadowRule[] }> {
  const staff = await staffRules(org)
  const resolved = await resolveRules(org, staff)
  const own = new Set(resolved.filter((r) => r.origin !== "catalog" || !r.enabled).map((r) => r.id))
  return { active: resolved.filter((r) => r.enabled), shadow: staff.shadow.filter((s) => !own.has(s.rule.id)) }
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
