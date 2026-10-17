import { check } from "recheck"
import { z } from "zod"
import { logger } from "@/lib/logger"
import { toRegex } from "@/lib/rules/operators"
import type { Condition } from "@/schemas/rule-advanced"
import { ruleSchema, rulesFileSchema, type ConditionGroup, type Rule } from "@/schemas/rule"
import { staffRuleSchema } from "@/schemas/staff-rule"

// Rules validated for catastrophic backtracking, for the paths that *write* a
// rule.

// A long alternation takes recheck's pure backend about 5s on a laptop and
// longer on a serverless CPU. Saving a rule is rare; the wait is acceptable.
const CHECK_TIMEOUT_MS = 20_000

// recheck's automatic choice spawns a native agent, which a serverless function
// cannot rely on. Pure runs in-process and answers every shipped rule in <300ms.
if (process.env.NEXT_RUNTIME) process.env.RECHECK_BACKEND ??= "pure"

export type RegexVerdict = { ok: true } | { ok: false; reason: string }

// The one field-level decision, exported so both callers and tests share it.
export async function checkRegexSafety(source: string): Promise<RegexVerdict> {
  let result
  try {
    result = await check(source, "", { timeout: CHECK_TIMEOUT_MS })
  } catch (error) {
    logger.warn("regex_check_failed", { error: error instanceof Error ? error.message : String(error) })
    return { ok: false, reason: "could not be analysed" }
  }

  if (result.status === "safe") return { ok: true }
  if (result.status === "vulnerable") {
    return {
      ok: false,
      reason: `runs in ${result.complexity?.type ?? "super-linear"} time on crafted input, which would hang the scanner and silence detection for that push`,
    }
  }
  const kind = result.error?.kind ?? "unknown"
  logger.warn("regex_check_unknown", { kind, source: source.slice(0, 120), checker: result.checker })
  return {
    ok: false,
    reason:
      kind === "timeout"
        ? "was too complex to verify as safe within the time limit; simplify it"
        : `could not be checked (${kind})`,
  }
}

type Source = { path: (string | number)[]; source: string }

const treeSources = (c: Condition, path: (string | number)[]): Source[] => {
  if ("all" in c) return c.all.flatMap((child, i) => treeSources(child, [...path, "all", i]))
  if ("any" in c) return c.any.flatMap((child, i) => treeSources(child, [...path, "any", i]))
  if ("not" in c) return treeSources(c.not, [...path, "not"])
  if (!("lines" in c)) return []
  const { op, values } = c.lines
  return values.map((value, i) => ({ path: [...path, "lines", "values", i], source: toRegex({ op, value }) }))
}

// Every regular expression a rule will run, wherever it sits.
export function ruleRegexes(rule: Rule): Source[] {
  const groups: [(string | number)[], Rule | ConditionGroup][] = [
    [[], rule],
    ...(rule.any_of ?? []).map((group, i): [(string | number)[], ConditionGroup] => [["any_of", i], group]),
  ]
  const sources: Source[] = []
  for (const [path, group] of groups) {
    for (const field of ["added_lines", "commit_message"] as const) {
      const value = group[field]
      const list = value === undefined ? [] : Array.isArray(value) ? value : [value]
      list.forEach((source, i) => sources.push({ path: [...path, field, ...(Array.isArray(value) ? [i] : [])], source }))
    }
  }
  return [...sources, ...(rule.advanced ? treeSources(rule.advanced.when, ["advanced", "when"]) : [])]
}

async function refine(rule: Rule, ctx: z.RefinementCtx): Promise<void> {
  for (const { path, source } of ruleRegexes(rule)) {
    const verdict = await checkRegexSafety(source)
    if (!verdict.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: `Unsafe regular expression: it ${verdict.reason}.` })
  }
}

// One rule, on its way in. Async: parse with parseAsync or safeParseAsync.
export const checkedRuleSchema = ruleSchema.superRefine(refine)

// The same check for a rule staff publish.
export const checkedStaffRuleSchema = staffRuleSchema.superRefine(refine)

// A whole file of them: import, and the repository's own example file.
export const checkedRulesFileSchema = rulesFileSchema.superRefine(async (rules, ctx) => {
  for (const rule of rules) await refine(rule, ctx)
})
