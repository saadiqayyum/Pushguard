import {
  CHANGE_SOURCES,
  hasCondition,
  ruleSchema,
  type ChangeType,
  type ConditionGroup,
  type Rule,
  type Severity,
} from "@/schemas/rule"
import { advancedToDraft, draftToAdvanced, draftToResponses, responsesToDraft, type AdvancedDraft, type HourOp, type ThenDraft } from "./draft-advanced"

export const WHEN_FLAGS = [
  { flag: "forced", label: "force push" },
  { flag: "sender_first_push", label: "first push by sender" },
  { flag: "branch_created", label: "branch created" },
  { flag: "branch_deleted", label: "branch deleted" },
  { flag: "author_mismatch", label: "author mismatch" },
  { flag: "unreviewed", label: "not reviewed" },
  { flag: "pr_draft", label: "PR draft" },
  { flag: "pr_opened", label: "PR opened" },
] as const

export type WhenFlag = (typeof WHEN_FLAGS)[number]["flag"]
export type ChangeSource = (typeof CHANGE_SOURCES)[number]

type RowBody =
  | { field: "paths" | "exclude_paths" | "added_lines" | "commit_message"; values: string[] }
  | { field: "change_type"; values: ChangeType[] }
  | { field: "unicode_risk"; value: "controls" | "confusables" }
  | { field: "when"; flags: { flag: WhenFlag; value: boolean }[] }
  | { field: "hour_utc"; op: HourOp; range: [number, number] }
  | { field: "all_of"; sets: string[][] }
export type Row = { key: string } & RowBody
export type Field = Row["field"]
export type Group = { key: string; rows: Row[] }

export const FIELD_LABELS: Record<Field, string> = {
  paths: "File path",
  exclude_paths: "File path is not",
  change_type: "Change type",
  added_lines: "New code",
  commit_message: "Commit message",
  unicode_risk: "Hidden characters in new code",
  when: "Push details",
  hour_utc: "Time (UTC)",
  all_of: "Files changed together",
}

export type Draft = {
  id: string
  description: string
  severity: Severity
  enabled: boolean
  pack?: string
  on: ChangeSource[]
  repos: string[]
  branches: string[]
  groups: Group[]
  advanced: AdvancedDraft
  then: ThenDraft
}

export type DraftErrors = Record<string, string>

let counter = 0
export const newKey = () => `k${++counter}`

export function blankRow(field: Field): Row {
  const key = newKey()
  switch (field) {
    case "change_type":
      return { key, field, values: ["added", "modified"] }
    case "unicode_risk":
      return { key, field, value: "controls" }
    case "when":
      return { key, field, flags: [{ flag: "forced", value: true }] }
    case "hour_utc":
      return { key, field, op: "not_between", range: [9, 18] }
    case "all_of":
      return { key, field, sets: [[], []] }
    default:
      return { key, field, values: [] }
  }
}

export const blankGroup = (): Group => ({ key: newKey(), rows: [blankRow("paths")] })

export function blankDraft(): Draft {
  return { id: "", description: "", severity: "high", enabled: true, on: [...CHANGE_SOURCES], repos: [], branches: [], groups: [blankGroup()], advanced: advancedToDraft(undefined), then: responsesToDraft(undefined) }
}

const asList = (value: string | string[] | undefined) => (value === undefined ? [] : Array.isArray(value) ? value : [value])

// Top-level conditions are the first group; the engine ORs them with any_of.
export function groupsOf(rule: Rule): ConditionGroup[] {
  const { paths, all_of, exclude_paths, change_type, when, added_lines, commit_message, unicode_risk } = rule
  const top = { paths, all_of, exclude_paths, change_type, when, added_lines, commit_message, unicode_risk }
  return [...(hasCondition(top) ? [top] : []), ...(rule.any_of ?? [])]
}

function rowsOf(g: ConditionGroup): Row[] {
  const rows: Row[] = []
  const add = (row: RowBody) => rows.push({ ...row, key: newKey() })
  if (g.paths) add({ field: "paths", values: g.paths })
  if (g.exclude_paths) add({ field: "exclude_paths", values: g.exclude_paths })
  if (g.all_of) add({ field: "all_of", sets: g.all_of })
  if (g.change_type) add({ field: "change_type", values: g.change_type })
  if (g.added_lines) add({ field: "added_lines", values: asList(g.added_lines) })
  if (g.commit_message) add({ field: "commit_message", values: asList(g.commit_message) })
  if (g.unicode_risk) add({ field: "unicode_risk", value: g.unicode_risk })
  const { hour_utc, ...flags } = g.when ?? {}
  const set = WHEN_FLAGS.flatMap(({ flag }) => (flags[flag] === undefined ? [] : [{ flag, value: flags[flag] }]))
  if (set.length) add({ field: "when", flags: set })
  if (hour_utc) {
    const op: HourOp = hour_utc.between ? "between" : "not_between"
    add({ field: "hour_utc", op, range: (hour_utc.between ?? hour_utc.not_between)! })
  }
  return rows
}

export function ruleToDraft(rule: Rule): Draft {
  return {
    id: rule.id,
    description: rule.description ?? "",
    severity: rule.severity,
    enabled: rule.enabled,
    pack: rule.pack,
    on: rule.on ?? [...CHANGE_SOURCES],
    repos: rule.repos ?? [],
    branches: rule.branches ?? [],
    groups: groupsOf(rule).map((g) => ({ key: newKey(), rows: rowsOf(g) })),
    advanced: advancedToDraft(rule.advanced),
    then: responsesToDraft(rule.responses),
  }
}

export function regexError(source: string): string | undefined {
  try {
    new RegExp(source)
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message.replace(/^Invalid regular expression: /, "") : "Invalid pattern"
  }
}

// An empty row is dropped on save rather than blocking it.
const isEmpty = (row: Row) =>
  "values" in row ? row.values.length === 0 : row.field === "when" ? row.flags.length === 0 : row.field === "all_of" ? row.sets.filter((s) => s.length).length < 2 : false

function toGroup(rows: Row[]): ConditionGroup {
  const g: Record<string, unknown> = {}
  const when: Record<string, unknown> = {}
  for (const row of rows) {
    if (isEmpty(row)) continue
    if (row.field === "added_lines" || row.field === "commit_message") g[row.field] = row.values.length === 1 ? row.values[0] : row.values
    else if ("values" in row) g[row.field] = row.values
    else if (row.field === "unicode_risk") g.unicode_risk = row.value
    else if (row.field === "all_of") g.all_of = row.sets.filter((s) => s.length)
    else if (row.field === "hour_utc") when.hour_utc = { [row.op]: row.range }
    else for (const { flag, value } of row.flags) when[flag] = value
  }
  if (Object.keys(when).length) g.when = when
  return g as ConditionGroup
}

const CONDITION_KEYS = new Set(["paths", "exclude_paths", "all_of", "change_type", "when", "added_lines", "commit_message", "unicode_risk"])

// Error key for a schema issue path: `g1.added_lines.0`, `g0`, `id`.
export function locate(path: readonly PropertyKey[]): string {
  let p = path.map((s) => (typeof s === "symbol" ? "" : s))
  if (p[0] === "rule") p = p.slice(1)
  let g = 0
  if (p[0] === "any_of") {
    g = Number(p[1] ?? 0)
    p = p.slice(2)
  } else if (p.length && !CONDITION_KEYS.has(String(p[0]))) return String(p[0])
  const [field, ...rest] = p
  if (field === undefined) return `g${g}`
  if (field === "when") return `g${g}.${rest[0] === "hour_utc" ? "hour_utc" : "when"}`
  if ((field === "added_lines" || field === "commit_message") && rest.length === 0) return `g${g}.${field}.0`
  return [`g${g}`, field, ...rest].join(".")
}

// The API flattens zod issues to "rule.any_of.1.added_lines.0: message; ...".
export function serverErrors(message: string): DraftErrors | null {
  const errors: DraftErrors = {}
  for (const part of message.split("; ")) {
    const at = part.indexOf(": ")
    if (!part.startsWith("rule.") || at < 0) continue
    const path = part.slice(0, at).split(".").map((s) => (/^\d+$/.test(s) ? Number(s) : s))
    errors[locate(path)] ??= part.slice(at + 2)
  }
  return Object.keys(errors).length ? errors : null
}

export function draftToRule(draft: Draft): { rule?: Rule; errors: DraftErrors } {
  const errors: DraftErrors = {}
  const advanced = draftToAdvanced(draft.advanced)
  const responses = draftToResponses(draft.then)
  const patternless = advanced !== undefined && draft.groups.every((g) => g.rows.every(isEmpty))
  if (draft.then.detonate && draft.then.detonate.phases.length === 0 && !draft.then.detonate.check) errors.responses = "Pick a phase or a check"
  if (!patternless) draft.groups.forEach((group, gi) => {
    if (group.rows.length === 0) errors[`g${gi}`] = "Add a condition or remove this group"
    else if (group.rows.every(isEmpty)) errors[`g${gi}`] = "Add a value"
    for (const row of group.rows) {
      if (row.field === "all_of" && isEmpty(row) && row.sets.some((s) => s.length)) errors[`g${gi}.all_of`] = "Add at least two file sets"
      if (row.field === "added_lines" || row.field === "commit_message") {
        row.values.forEach((v, i) => {
          const bad = regexError(v)
          if (bad) errors[`g${gi}.${row.field}.${i}`] = bad
        })
      }
    }
  })
  if (draft.on.length === 0) errors.on = "Pick pushes, pull requests, or both"

  const groups = patternless ? [] : draft.groups.map((g) => toGroup(g.rows))
  const candidate = {
    id: draft.id,
    severity: draft.severity,
    enabled: draft.enabled,
    ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
    ...(draft.pack ? { pack: draft.pack } : {}),
    ...(draft.on.length && draft.on.length < CHANGE_SOURCES.length ? { on: draft.on } : {}),
    ...(draft.repos.length ? { repos: draft.repos } : {}),
    ...(draft.branches.length ? { branches: draft.branches } : {}),
    ...(groups.length === 1 ? groups[0] : groups.length ? { any_of: groups } : {}),
    ...(advanced ? { advanced } : {}),
    ...(responses ? { responses } : {}),
  }
  const parsed = ruleSchema.safeParse(candidate)
  if (!parsed.success) for (const issue of parsed.error.issues) errors[locate(issue.path)] ??= issue.message
  return Object.keys(errors).length || !parsed.success ? { errors } : { rule: parsed.data, errors }
}
