import { check } from "recheck"
import { z } from "zod"
import { logger } from "@/lib/logger"
import { ruleSchema, rulesFileSchema, type Rule } from "@/schemas/rule"

// Rules validated for catastrophic backtracking, for the paths that *write* a
// rule.

const CHECK_TIMEOUT_MS = 5000

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
  logger.warn("regex_check_unknown", { kind, length: source.length })
  return {
    ok: false,
    reason:
      kind === "timeout"
        ? "was too complex to verify as safe within the time limit; simplify it"
        : `could not be checked (${kind})`,
  }
}

async function refine(rule: Rule, ctx: z.RefinementCtx): Promise<void> {
  for (const field of ["added_lines", "commit_message"] as const) {
    const source = rule[field]
    if (!source) continue
    const verdict = await checkRegexSafety(source)
    if (!verdict.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `Unsafe regular expression: it ${verdict.reason}.`,
      })
    }
  }
}

// One rule, on its way in. Async: parse with parseAsync or safeParseAsync.
export const checkedRuleSchema = ruleSchema.superRefine(refine)

// A whole file of them: import, and the repository's own example file.
export const checkedRulesFileSchema = rulesFileSchema.superRefine(async (rules, ctx) => {
  for (const rule of rules) await refine(rule, ctx)
})
