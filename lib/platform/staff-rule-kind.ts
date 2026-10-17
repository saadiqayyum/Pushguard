import { insertPlatformRule, platformRuleVersions, publishedCheckScript, recordPlatformAudit, updatePlatformRule, type PlatformRuleRow } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { runFixtures, type FixtureResult } from "@/lib/rules/advanced/evaluate"
import { catalogById, PACKS } from "@/lib/rules/catalog"
import { checkRegexSafety, ruleRegexes } from "@/schemas/rule-safety"
import { kebab } from "@/schemas/rule"
import { staffRuleSchema, type StaffRule } from "@/schemas/staff-rule"
import { auditTarget, draftVersion, type ArtifactKind } from "./transition"
import { staffRuleSignedBody } from "./verify"

const issues = (error: { issues: { path: PropertyKey[]; message: string }[] }) =>
  error.issues.map((i) => `${i.path.map(String).join(".") || "rule"}: ${i.message}`)

export const fixtureFailures = (results: FixtureResult[]) =>
  results.filter((r) => r.expected !== r.got).map((r) => `Fixture "${r.fixture}" expected ${r.expected}, got ${r.got}`)

export async function regexProblems(rule: StaffRule): Promise<string[]> {
  const problems: string[] = []
  for (const source of new Set(ruleRegexes(rule).map((r) => r.source))) {
    const verdict = await checkRegexSafety(source)
    if (!verdict.ok) problems.push(`Unsafe regular expression ${JSON.stringify(source.slice(0, 80))}: it ${verdict.reason}`)
  }
  return problems
}

// A rule of staff's own lands in a catalog pack and proves itself with fixtures;
// an override of a shipped rule inherits both.
async function shapeProblems(rule: StaffRule): Promise<string[]> {
  const problems: string[] = []
  if (!catalogById.has(rule.id)) {
    if (!PACKS.some((p) => p.id === rule.pack)) problems.push(`pack: Use one of ${PACKS.map((p) => p.id).join(", ")}`)
    if (!rule.fixtures) problems.push("fixtures: Required for a rule that is not in the catalog")
  }
  for (const response of rule.responses ?? []) {
    const check = "detonate" in response ? response.detonate.check : undefined
    if (check && !(await publishedCheckScript(check))) problems.push(`responses: No published check named ${check}`)
  }
  return problems
}

// Fixtures execute the rule's patterns, so they run only once every pattern is known to be linear.
export async function staffRuleEvidence(body: unknown) {
  const parsed = staffRuleSchema.safeParse(body)
  if (!parsed.success) return { schemaProblems: issues(parsed.error), regexProblems: [], fixtures: null }
  const rule = parsed.data
  const schemaProblems = await shapeProblems(rule)
  const unsafe = await regexProblems(rule)
  if (unsafe.length || !rule.fixtures) return { schemaProblems, regexProblems: unsafe, fixtures: null }
  const run = await runFixtures(rule)
  return { schemaProblems, regexProblems: [], fixtures: { passed: run.passed, failures: fixtureFailures(run.results), results: run.results } }
}

export const staffRuleKind: ArtifactKind<PlatformRuleRow> = {
  name: "rule",
  versions: platformRuleVersions,
  evidence: (row) => staffRuleEvidence(row.body),
  signedBody: (row, to) => staffRuleSignedBody(row.body, to),
  setStatus: (row, change) => updatePlatformRule(row.id, row.version, change),
}

// A shipped rule keeps its id and pack. The stored version is the console's, never the editor's.
export async function saveStaffRule(actor: string, body: Record<string, unknown>, isNew: boolean): Promise<{ id: string; version: number }> {
  const id = kebab.parse(body.id)
  const base = catalogById.get(id)
  const { version, exists } = await draftVersion(staffRuleKind, id)
  if (isNew && (exists || version > 1 || base)) throw new AppError("validation_failed", `A rule named ${id} already exists`)
  const rule = staffRuleSchema.parse({ ...body, ...(base ? { id: base.id, pack: base.pack } : {}) })
  if (exists) await updatePlatformRule(id, version, { body: rule })
  else await insertPlatformRule({ id, version, body: rule, status: "draft", createdBy: actor })
  await recordPlatformAudit({ actor, action: "draft_saved", target: auditTarget("rule", id, version), details: {} })
  return { id, version }
}
