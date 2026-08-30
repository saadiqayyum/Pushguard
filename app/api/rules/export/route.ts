import { stringify } from "yaml"
import { memberScopes, requireUser } from "@/lib/auth"
import { rulesCollection } from "@/lib/db"
import { catalogRules } from "@/lib/rules/catalog"
import { AppError } from "@/lib/errors"
import { withErrorHandler } from "@/lib/route"
import { resolveTenant } from "@/lib/tenant"
import type { Rule } from "@/schemas/rule"

const HEADER = [
  "# Pushguard rules.",
  "# Every field except id and severity is optional, but a rule must have at",
  "# least one condition (paths, all_of, when, added_lines, or ai).",
  "# All fields on a rule AND together; rules evaluate independently (OR).",
  "# Globs: picomatch syntax. Regex: JS syntax, max 500 chars.",
  "# Severity -> action: critical/high = issue + mention, medium = issue,",
  "# low = issue for digest triage.",
  "",
].join("\n")

/**
 * Rules as YAML, for editing outside the app and importing back.
 *
 * `?example=1` returns the set every new account is seeded with. Generated from
 * `lib/default-rules.ts` rather than read from `rules.example.yaml` on disk: a
 * serverless filesystem is not a dependable place to look for a repository
 * file, and generating it from the module means the download can never drift
 * from what the app actually ships.
 */
export const GET = withErrorHandler("/api/rules/export", async (request) => {
  const example = new URL(request.url).searchParams.get("example") === "1"

  let rules: Rule[] = catalogRules
  let filename = "pushguard-rules.example.yaml"

  if (!example) {
    const user = await requireUser()
    const tenant = await resolveTenant(memberScopes(user))
    if (!tenant.current) throw new AppError("forbidden", "No Pushguard installation for this account")
    const docs = await (await rulesCollection())
      .find({ owner: tenant.current.installedBy })
      .sort({ ruleId: 1 })
      .toArray()
    rules = docs.map((doc) => doc.body)
    filename = "pushguard-rules.yaml"
  }

  return new Response(HEADER + stringify(rules), {
    headers: {
      "Content-Type": "text/yaml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
})
