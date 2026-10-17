import { stringify } from "yaml"
import { rulesFor } from "@/lib/db"
import { catalogRules } from "@/lib/rules/catalog"
import { userRoute } from "@/lib/route"
import { requireTenant } from "@/lib/tenant"
import { ruleSchema, type Rule } from "@/schemas/rule"

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

export const GET = userRoute("/api/rules/export", async (request) => {
  const example = new URL(request.url).searchParams.get("example") === "1"
  let rules: Rule[] = catalogRules
  if (!example) {
    const { org } = await requireTenant()
    rules = (await rulesFor(org))
      .sort((a, b) => a.ruleId.localeCompare(b.ruleId))
      .map((doc) => ruleSchema.parse(doc.body))
  }

  return new Response(HEADER + stringify(rules), {
    headers: {
      "Content-Type": "text/yaml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${example ? "pushguard-rules.example.yaml" : "pushguard-rules.yaml"}"`,
    },
  })
})
