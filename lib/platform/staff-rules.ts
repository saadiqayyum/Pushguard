import { runnablePlatformRules, type PlatformRuleRow } from "@/lib/db"
import { env } from "@/lib/env"
import { MAX_PROSE_LENGTH } from "@/lib/finding"
import { logger } from "@/lib/logger"
import { catalogById } from "@/lib/rules/catalog"
import { DESCRIPTION_MAX, type Rule } from "@/schemas/rule"
import { ruleOf, staffRuleSchema, type StaffRule } from "@/schemas/staff-rule"
import { configuredKeys } from "./signing"
import { verifyStaffRule } from "./verify"

export type ShadowRule = { rule: Rule; version: number }
export type StaffRules = { live: Map<string, Rule>; shadow: ShadowRule[] }
type Loaded = { staff: StaffRule; version: number; status: PlatformRuleRow["status"] }

const EMPTY: StaffRules = { live: new Map(), shadow: [] }

// The incident list is what makes a staff rule's alert actionable, so it rides in the description.
function describe(staff: StaffRule): string | undefined {
  const incidents = (staff.incidents ?? []).map((i) => `[${i.name.replace(/[[\]]/g, "")}](${i.url}) (${i.date})`).join(", ")
  const text = [staff.description, incidents && `Seen in: ${incidents}`].filter(Boolean).join(". ")
  return text ? text.slice(0, Math.min(DESCRIPTION_MAX, MAX_PROSE_LENGTH)) : undefined
}

function toRule(staff: StaffRule): Rule {
  const base = catalogById.get(staff.id)
  return { ...ruleOf(staff), description: describe(staff), ...(base ? { id: base.id, pack: base.pack } : {}) }
}

// Pure. A row whose signature or shape fails is never loaded. Per id: the
// newest live version, plus a newer shadow version measured alongside it.
export function selectStaffRules(rows: PlatformRuleRow[], publicKey: string | null, internal: boolean): StaffRules {
  if (!publicKey) {
    if (rows.length > 0) logger.error("staff_rule_public_key_missing", { rows: rows.length })
    return EMPTY
  }
  const verified: Loaded[] = []
  for (const row of rows) {
    const parsed = staffRuleSchema.safeParse(row.body)
    const signed = verifyStaffRule(row, publicKey)
    if (!signed || !parsed.success || parsed.data.id !== row.id) {
      logger.error("staff_rule_skipped", { ruleId: row.id, version: row.version, status: row.status, signed, valid: parsed.success })
      continue
    }
    verified.push({ staff: parsed.data, version: row.version, status: row.status })
  }
  const out: StaffRules = { live: new Map(), shadow: [] }
  for (const group of Map.groupBy(verified, (r) => r.staff.id).values()) {
    const sorted = group.sort((a, b) => b.version - a.version)
    const live = sorted.find((r) => r.status === "published" || (internal && r.status === "internal"))
    const shadow = sorted.find((r) => r.status === "shadow" && r.version > (live?.version ?? 0))
    if (live) out.live.set(live.staff.id, toRule(live.staff))
    if (shadow) out.shadow.push({ rule: toRule(shadow.staff), version: shadow.version })
  }
  return out
}

// Fails soft to the shipped catalog: an unreadable overlay must never stop a push
// from being evaluated or the Rules page from loading.
export async function staffRules(org: string): Promise<StaffRules> {
  try {
    const rows = await runnablePlatformRules()
    return rows.length ? selectStaffRules(rows, configuredKeys().publicKey, env().PLATFORM_INTERNAL_ORGS.includes(org.toLowerCase())) : EMPTY
  } catch (error) {
    logger.error("platform_rules_unavailable", { error: error instanceof Error ? error.message : String(error) })
    return EMPTY
  }
}
