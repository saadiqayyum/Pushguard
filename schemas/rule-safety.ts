import { checkSync } from "recheck"
import { z } from "zod"
import { ruleSchema, rulesFileSchema, type Rule } from "@/schemas/rule"

/**
 * Rules validated for catastrophic backtracking, for the paths that *write* a
 * rule.
 *
 * Deliberately not folded into `ruleSchema`. That schema is parsed on the read
 * path too, by `getActiveRules` on every single push and by `default-rules.ts`
 * at module load, and this check costs hundreds of milliseconds on a
 * complicated pattern. Paying it there would put a second on every webhook and
 * on every cold start. A rule is written rarely and read constantly, so the
 * cost belongs at the write.
 *
 * What it prevents: a user saves a pattern like `(\w+\s?)+=`, an attacker
 * pushes a line that makes it backtrack, and the invocation evaluating that
 * push never finishes. The push is never assessed and nothing is filed. It is
 * not a slow server, it is a detector that goes silent on demand, which is
 * worth more to an attacker than any single rule is to a defender.
 *
 * `redos-detector` was tried first and cannot do this job: it answers
 * "inconclusive" as `safe: false`, so it rejected two of the rules Pushguard
 * itself ships while flagging the genuinely dangerous one no differently.
 */

const CHECK_TIMEOUT_MS = 5000

export type RegexVerdict = { ok: true } | { ok: false; reason: string }

/** The one field-level decision, exported so both callers and tests share it. */
export function checkRegexSafety(source: string): RegexVerdict {
  let result
  try {
    result = checkSync(source, "", { timeout: CHECK_TIMEOUT_MS })
  } catch {
    // A pattern recheck cannot even parse is not one to store. `ruleSchema` has
    // already established that it compiles, so this is genuinely exotic.
    return { ok: false, reason: "could not be analysed" }
  }

  if (result.status === "safe") return { ok: true }
  if (result.status === "vulnerable") {
    return {
      ok: false,
      reason: `runs in ${result.complexity?.type ?? "super-linear"} time on crafted input, which would hang the scanner and silence detection for that push`,
    }
  }
  // "unknown" means the analysis ran out of time, not that the pattern is fine.
  // Rejected rather than allowed: an over-strict answer costs somebody a rewrite
  // and says so, while an over-permissive one leaves a silent hole. Both are the
  // user's to fix, only one of them is visible.
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

/** One rule, on its way in. */
export const checkedRuleSchema = ruleSchema.superRefine(refine)

/** A whole file of them: import, and the repository's own example file. */
export const checkedRulesFileSchema = rulesFileSchema.superRefine((rules, ctx) => {
  rules.forEach((rule) => refine(rule, ctx))
})
