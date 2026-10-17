import { staffRuleEvidence } from "@/lib/platform/staff-rule-kind"
import type { FixtureResult } from "@/lib/rules/advanced/evaluate"
import { catalogById } from "@/lib/rules/catalog"
import { staffRuleSchema, type StaffRule } from "@/schemas/staff-rule"

const URL_IN_TEXT = /https:\/\/[^\s<>"'`)\]}]+/g
const TRAILING = /[.,;:!?]+$/

const normalize = (raw: string): string | null => {
  try {
    const url = new URL(raw.replace(TRAILING, ""))
    return url.protocol === "https:" ? url.href : null
  } catch {
    return null
  }
}

// Every https URL an input actually contains. A draft may cite these and no others.
export function inputUrls(texts: string[], explicit: string[]): Set<string> {
  const found = [...explicit, ...texts.flatMap((t) => t.match(URL_IN_TEXT) ?? [])]
  return new Set(found.map(normalize).filter((u): u is string => u !== null))
}

// Pure. Drops any incident, reference or doc the inputs did not name, so a model
// cannot invent a source or launder an attacker's link into a published page.
export function filterCitations(
  draft: Record<string, unknown>,
  allowedUrls: Set<string>,
  allowedDocs: Set<string>,
): { draft: Record<string, unknown>; dropped: string[] } {
  const dropped: string[] = []
  const keep = (value: unknown) => {
    const url = typeof value === "object" && value && "url" in value ? normalize(String(value.url)) : null
    if (url && allowedUrls.has(url)) return true
    dropped.push(typeof value === "object" && value && "url" in value ? String(value.url).slice(0, 300) : "(no url)")
    return false
  }
  const list = (key: string) => (Array.isArray(draft[key]) ? (draft[key] as unknown[]) : [])
  const docs = list("docs").filter((d) => {
    if (typeof d === "string" && allowedDocs.has(d)) return true
    dropped.push(String(d).slice(0, 300))
    return false
  })
  return {
    draft: {
      ...draft,
      incidents: list("incidents").filter(keep),
      references: list("references").filter(keep),
      ...(docs.length ? { docs } : { docs: undefined }),
    },
    dropped,
  }
}

export type DraftVerdict = {
  rule: StaffRule | null
  body: Record<string, unknown>
  problems: string[]
  dropped: string[]
  fixtures: { passed: boolean; results: FixtureResult[] } | null
  valid: boolean
}

// The model never sets a version or status, and never takes a shipped rule's id.
// A draft with failing fixtures is still placed: staff fix fixtures, not the model.
export async function validateDraft(raw: Record<string, unknown>, context: { allowedUrls: Set<string>; allowedDocs: Set<string> }): Promise<DraftVerdict> {
  const { draft, dropped } = filterCitations(Object.fromEntries(Object.entries(raw).filter(([k]) => k !== "version" && k !== "status")), context.allowedUrls, context.allowedDocs)
  const parsed = staffRuleSchema.safeParse(draft)
  const evidence = await staffRuleEvidence(draft)
  const taken = parsed.success && catalogById.has(parsed.data.id) ? [`id: ${parsed.data.id} is a shipped rule`] : []
  const blocking = [...taken, ...evidence.schemaProblems, ...evidence.regexProblems]
  return {
    rule: parsed.success ? parsed.data : null,
    body: parsed.success ? parsed.data : draft,
    problems: [...blocking, ...(evidence.fixtures?.failures ?? [])],
    dropped,
    fixtures: evidence.fixtures && { passed: evidence.fixtures.passed, results: evidence.fixtures.results },
    valid: parsed.success && blocking.length === 0,
  }
}
