import { FIELD_LABELS, groupsOf, WHEN_FLAGS } from "@/lib/rules/draft"
import { fromGlob, fromRegex, OPERATOR_LABELS, type Operand } from "@/lib/rules/operators"
import { ADVANCED_LABELS, advancedToDraft } from "@/lib/rules/draft-advanced"
import type { Rule } from "@/schemas/rule"

const advancedSummary = (rule: Rule): string => {
  const { rows } = advancedToDraft(rule.advanced)
  return rows.length ? [...new Set(rows.map((r) => ADVANCED_LABELS[r.kind]))].join(" · ") : "Advanced conditions"
}

export const humanize = (id: string) => id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, " ")

export const slugify = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64).replace(/-+$/, "")

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

// "New code contains preinstall", or "New code: 3 patterns" when one line cannot say it.
function sentence(label: string, stored: string[], parse: (value: string) => Operand): string {
  if (stored.length !== 1) return `${label}: ${plural(stored.length, "pattern")}`
  const { op, value } = parse(stored[0])
  return `${label} ${OPERATOR_LABELS[op]} ${value}`
}

export function summarize(rule: Rule): string {
  const groups = groupsOf(rule)
  const advanced = rule.advanced ? advancedSummary(rule) : ""
  if (groups.length === 0) return advanced
  if (groups.length !== 1) return [plural(groups.length, "group"), advanced].filter(Boolean).join(" · ")
  const g = groups[0]
  const parts: string[] = []
  if (g.paths) parts.push(sentence(FIELD_LABELS.paths, g.paths, fromGlob))
  if (g.all_of) parts.push(`${g.all_of.length} file sets together`)
  if (g.added_lines) parts.push(sentence(FIELD_LABELS.added_lines, [g.added_lines].flat(), fromRegex))
  if (g.commit_message) parts.push(sentence(FIELD_LABELS.commit_message, [g.commit_message].flat(), fromRegex))
  if (g.unicode_risk) parts.push(FIELD_LABELS.unicode_risk)
  for (const { flag, label } of WHEN_FLAGS) {
    const value = g.when?.[flag]
    if (value !== undefined) parts.push(value ? label : `not ${label}`)
  }
  if (g.when?.hour_utc) parts.push(FIELD_LABELS.hour_utc)
  if (advanced) parts.push(advanced)
  return parts.join(" · ")
}
