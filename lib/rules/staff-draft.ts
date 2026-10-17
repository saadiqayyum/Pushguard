import type { Rule } from "@/schemas/rule"
import { STAFF_ONLY, type StaffRule } from "@/schemas/staff-rule"

export type StaffExtras = Pick<StaffRule, (typeof STAFF_ONLY)[number]>

const isExtra = (key: string) => (STAFF_ONLY as readonly string[]).includes(key)

// Stored bodies may predate the current schema; the server validates the joined rule on save.
export function splitStaffRule(doc: Record<string, unknown>): {
  rule: Rule
  extras: StaffExtras
} {
  const entries = Object.entries(doc).filter(([, value]) => value !== undefined)
  return {
    rule: Object.fromEntries(entries.filter(([key]) => !isExtra(key))) as Rule,
    extras: Object.fromEntries(entries.filter(([key]) => isExtra(key))) as StaffExtras,
  }
}

export function joinStaffRule(rule: Rule, extras: StaffExtras): Record<string, unknown> {
  return {
    ...rule,
    ...Object.fromEntries(Object.entries(extras).filter(([, value]) => value !== undefined)),
  }
}
