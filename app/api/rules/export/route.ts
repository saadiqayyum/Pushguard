import { stringify } from "yaml"
import { db } from "@/lib/db"
import { catalogRules } from "@/lib/rules/catalog"
import { withErrorHandler } from "@/lib/route"
import { requireManagedTenant } from "@/lib/tenant"
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

// Rules as YAML, for editing outside the app and importing back.
export const GET = withErrorHandler("/api/rules/export", async (request) => {
  const example = new URL(request.url).searchParams.get("example") === "1"

  let rules: Rule[] = catalogRules
  let filename = "pushguard-rules.example.yaml"

  if (!example) {
    const { owner } = await requireManagedTenant()
    const docs = await db.rules()
      .find({ owner })
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
