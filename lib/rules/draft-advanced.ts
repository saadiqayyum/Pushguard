import { FACT_KINDS, type FactKind } from "@/lib/code-intel/types"
import type { FocusId } from "@/lib/rules/focus"
import type { Advanced, Condition, DetonatePhase, Leaf, RuleResponse } from "@/schemas/rule-advanced"
import { INDICATOR_KINDS, type IndicatorKind } from "@/schemas/threat-intel"

type Key = { key: string }
export type HourOp = "between" | "not_between"
export type Hours = { op: HourOp; range: [number, number] }

export type AdvancedRow = Key &
  (
    | { kind: "commits"; kinds: FactKind[]; sameFile: boolean; days: number }
    | { kind: "contributor"; firstPush: boolean; hours: Hours | null }
    | { kind: "indicator"; campaign: string; indicator: IndicatorKind | "" }
  )
export type AdvancedKind = AdvancedRow["kind"]

// Rows the form edits, or the stored tree untouched when it uses more than the form can show.
export type AdvancedDraft = { rows: AdvancedRow[]; raw: Advanced | null }

export const ADVANCED_LABELS: Record<AdvancedKind, string> = {
  commits: "Across commits",
  contributor: "Contributor and time",
  indicator: "Threat indicator",
}

export const FACT_LABELS: Record<FactKind, string> = {
  network: "Network call",
  process: "Runs a process",
  eval: "Evaluates code",
  env_read: "Reads environment",
  secret_read: "Reads a secret",
  file_write: "Writes a file",
  decode: "Decodes data",
  obfuscation: "Obfuscation",
  opaque_blob: "Opaque blob",
  install_hook: "Install hook",
  build_hook: "Build hook",
  ci_trigger: "CI trigger",
  entry_point: "Entry point",
  activation_gate: "Activation gate",
  defense_weakened: "Defense weakened",
}

export const INDICATOR_LABELS: Record<IndicatorKind, string> = {
  domain: "Domain",
  ip: "IP address",
  url: "URL",
  wallet: "Wallet",
  file_name: "File name",
  package: "Package",
  string: "String",
}

export const DEFAULT_WITHIN_DAYS = 30

let counter = 0
const newKey = () => `a${++counter}`

export function blankAdvancedRow(kind: AdvancedKind): AdvancedRow {
  const key = newKey()
  if (kind === "commits") return { key, kind, kinds: [], sameFile: false, days: DEFAULT_WITHIN_DAYS }
  if (kind === "contributor") return { key, kind, firstPush: true, hours: null }
  return { key, kind, campaign: "", indicator: "" }
}

function rowOf(leaf: Leaf, days: number | undefined): AdvancedRow | null {
  const key = newKey()
  if ("facts" in leaf && !leaf.facts.same_symbol) return { key, kind: "commits", kinds: leaf.facts.kinds, sameFile: Boolean(leaf.facts.same_file), days: days ?? DEFAULT_WITHIN_DAYS }
  if ("indicator" in leaf) return { key, kind: "indicator", campaign: leaf.indicator.campaign ?? "", indicator: leaf.indicator.kind ?? "" }
  if ("context" in leaf) {
    const { sender_first_push, hour_utc, ...rest } = leaf.context
    if (Object.keys(rest).length || sender_first_push === false) return null
    const hours: Hours | null = hour_utc ? { op: hour_utc.between ? "between" : "not_between", range: (hour_utc.between ?? hour_utc.not_between)! } : null
    return { key, kind: "contributor", firstPush: Boolean(sender_first_push), hours }
  }
  return null
}

export function advancedToDraft(advanced: Advanced | undefined): AdvancedDraft {
  if (!advanced) return { rows: [], raw: null }
  const leaves = "all" in advanced.when ? advanced.when.all : [advanced.when]
  const plain = !advanced.within?.commits && leaves.every((c) => !("all" in c || "any" in c || "not" in c))
  const rows = plain ? leaves.map((leaf) => rowOf(leaf as Leaf, advanced.within?.days)) : []
  return rows.length && rows.every(Boolean) ? { rows: rows as AdvancedRow[], raw: null } : { rows: [], raw: advanced }
}

function leafOf(row: AdvancedRow): Leaf | null {
  if (row.kind === "commits") return row.kinds.length ? { facts: { kinds: row.kinds, ...(row.sameFile ? { same_file: true } : {}) } } : null
  if (row.kind === "indicator") {
    const campaign = row.campaign.trim()
    return { indicator: { ...(campaign ? { campaign } : {}), ...(row.indicator ? { kind: row.indicator } : {}) } }
  }
  const context = { ...(row.firstPush ? { sender_first_push: true } : {}), ...(row.hours ? { hour_utc: { [row.hours.op]: row.hours.range } } : {}) }
  return Object.keys(context).length ? { context } : null
}

export function draftToAdvanced(draft: AdvancedDraft): Advanced | undefined {
  if (draft.raw) return draft.raw
  const leaves = draft.rows.map(leafOf).filter((l): l is Leaf => l !== null)
  if (leaves.length === 0) return undefined
  const days = Math.max(0, ...draft.rows.map((r) => (r.kind === "commits" && r.kinds.length ? r.days : 0)))
  const when: Condition = leaves.length === 1 ? leaves[0] : { all: leaves }
  return { when, ...(days ? { within: { days } } : {}) }
}

export type ThenDraft = {
  investigate: { focus: FocusId; maxTokens?: number } | null
  detonate: { phases: Exclude<DetonatePhase, "check">[]; check: string | null } | null
  metaAlert: boolean
  snapshotTags: boolean
}

export function responsesToDraft(responses: RuleResponse[] | undefined): ThenDraft {
  const draft: ThenDraft = { investigate: null, detonate: null, metaAlert: false, snapshotTags: false }
  for (const r of responses ?? []) {
    if ("investigate" in r) draft.investigate ??= { focus: r.investigate.focus, maxTokens: r.investigate.max_tokens }
    else if ("detonate" in r) draft.detonate ??= { phases: r.detonate.phases.filter((p) => p !== "check"), check: r.detonate.check ?? null }
    else if ("meta_alert" in r) draft.metaAlert = true
    else draft.snapshotTags = true
  }
  return draft
}

export function draftToResponses(draft: ThenDraft): RuleResponse[] | undefined {
  const out: RuleResponse[] = []
  if (draft.investigate) out.push({ investigate: { focus: draft.investigate.focus, ...(draft.investigate.maxTokens ? { max_tokens: draft.investigate.maxTokens } : {}) } })
  if (draft.detonate) {
    const { phases, check } = draft.detonate
    out.push({ detonate: { phases: check ? [...phases, "check"] : phases, ...(check ? { check } : {}) } })
  }
  if (draft.metaAlert) out.push({ meta_alert: true })
  if (draft.snapshotTags) out.push({ snapshot_tags: true })
  return out.length ? out : undefined
}

export { FACT_KINDS, INDICATOR_KINDS }
