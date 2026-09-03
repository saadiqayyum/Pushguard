import { checkSync } from "recheck"
import { z } from "zod"
import { ruleSchema, rulesFileSchema, type Rule } from "@/schemas/rule"

// Rules validated for catastrophic backtracking, for the paths that *write* a
// rule.

const CHECK_TIMEOUT_MS = 5000

// recheck's default sync backend spawns a worker from a path it resolves at
// call time, which Next's bundled server cannot find. Pure runs in-process.
if (process.env.NEXT_RUNTIME) process.env.RECHECK_SYNC_BACKEND ??= "pure"

export type RegexVerdict = { ok: true } | { ok: false; reason: string }

// The one field-level decision, exported so both callers and tests share it.
export function checkRegexSafety(source: string): RegexVerdict {
  let result
  try {
    result = checkSync(source, "", { timeout: CHECK_TIMEOUT_MS })
  } catch {
    return { ok: false, reason: "could not be analysed" }
  }

  if (result.status === "safe") return { ok: true }
  if (result.status === "vulnerable") {
    return {
      ok: false,
      reason: `runs in ${result.complexity?.type ?? "super-linear"} time on crafted input, which would hang the scanner and silence detection for that push`,
    }
  }
  return {
    ok: false,
    reason: "was too complex to verify as safe within the time limit; simplify it",
  }
}

function refine(rule: Rule, ctx: z.RefinementCtx): void {
  for (const field of ["added_lines", "commit_message"] as const) {
    const source = rule[field]
    if (!source) continue
    const verdict = checkRegexSafety(source)
    if (!verdict.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `Unsafe regular expression: it ${verdict.reason}.`,
      })
    }
  }
}

// One rule, on its way in.
export const checkedRuleSchema = ruleSchema.superRefine(refine)

// A whole file of them: import, and the repository's own example file.
export const checkedRulesFileSchema = rulesFileSchema.superRefine((rules, ctx) => {
  rules.forEach((rule) => refine(rule, ctx))
})
