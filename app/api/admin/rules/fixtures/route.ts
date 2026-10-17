import { asSystem } from "@/lib/db"
import { adminRoute } from "@/lib/platform/auth"
import { staffRuleEvidence } from "@/lib/platform/staff-rule-kind"
import { respond } from "@/lib/route"
import { fixtureRunOut, runFixturesBody } from "@/schemas/admin"

// Regex safety checks may take seconds each; see schemas/rule-safety.ts.
export const maxDuration = 60

export const POST = adminRoute("/api/admin/rules/fixtures", async (request) => {
  const { rule } = runFixturesBody.parse(await request.json())
  const evidence = await asSystem(() => staffRuleEvidence(rule))
  return respond(fixtureRunOut, {
    problems: [...evidence.schemaProblems, ...evidence.regexProblems],
    fixtures: evidence.fixtures,
  })
})
