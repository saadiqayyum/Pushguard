import { TRUNCATED_FINDING } from "@/lib/alerts"
import { EMPTY_SHA } from "@/lib/change-event"
import { loadIndicators, type ScanFinding } from "@/lib/db"
import { DIFF_READ_BUDGET } from "@/lib/diff-lines"
import type { ChangedFile } from "@/lib/engine"
import { toFinding } from "@/lib/finding"
import { readsDiffFor } from "@/lib/indicator-branches"
import { buildMatcher, matchIndicators, type Indicator, type IndicatorMatcher } from "@/lib/indicators"
import type { PushDiff } from "@/lib/push-diff"
import type { PushPayload } from "@/schemas/webhook"

const INDICATOR_FINDING = {
  id: "threat-indicator",
  description: "This push contains a published indicator of a known supply-chain attack",
}

// Loaded once per push, before planning, so the plan knows whether lines are needed.
export async function pushIndicators(payload: PushPayload): Promise<IndicatorMatcher | null> {
  if (payload.deleted) return null
  const indicators = await loadIndicators()
  return indicators.length === 0 ? null : buildMatcher(indicators)
}

// A new branch has no base to diff against.
export function readsIndicatorLines(matcher: IndicatorMatcher | null, payload: PushPayload, extraBranches: string[] | null): boolean {
  if (!matcher || payload.before === EMPTY_SHA) return false
  const branch = payload.ref.replace("refs/heads/", "")
  return (matcher.tokens.size > 0 || matcher.substrings.length > 0) && readsDiffFor(branch, payload.repository.default_branch, extraBranches)
}

export async function indicatorFindings(
  matcher: IndicatorMatcher | null,
  payload: PushPayload,
  files: ChangedFile[],
  loadDiff: (() => Promise<PushDiff>) | null,
): Promise<{ findings: ScanFinding[]; hits: Indicator[] }> {
  if (!matcher) return { findings: [], hits: [] }
  const repo = payload.repository.full_name
  const loaded = loadDiff ? await loadDiff() : null
  const diff = loaded && { addedLines: loaded.addedLines, truncated: loaded.truncated || loaded.unread.length > 0 }
  const paths = files.filter((f) => f.changeType !== "removed").map((f) => f.path)
  const hits = matchIndicators(matcher, [...(diff?.addedLines.values() ?? [])].flat(), paths)
  const findings = hits.map((hit) =>
    toFinding(
      { ...INDICATOR_FINDING, severity: hit.kind === "string" ? "high" : "critical" },
      repo,
      [],
      [`${hit.kind} \`${hit.value.replaceAll("`", "")}\` from ${hit.campaign}${hit.actorName ? ` (${hit.actorName})` : ""}. Source: ${hit.references[0] ?? "none"}`],
      { prose: true },
    ),
  )
  if (diff?.truncated) {
    findings.push(toFinding(TRUNCATED_FINDING, repo, [], [`Read ${DIFF_READ_BUDGET} of a larger diff for indicators.`], { prose: true }))
  }
  return { findings, hits }
}
