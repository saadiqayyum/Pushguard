import type { ScanFinding } from "@/lib/db"
import { toFinding } from "@/lib/finding"
import type { FocusId } from "@/lib/rules/focus"
import { DETONATE_PHASES, type DetonatePhase } from "@/schemas/rule-advanced"
import type { Rule } from "@/schemas/rule"
import type { RuleHit } from "./evaluate"
import { MAX_ADVANCED_RULES_PER_PUSH, MAX_RESPONSES_PER_PUSH } from "./limits"

export type StagedRule = { rule: Rule; shadow: boolean; version?: number }
export type RoutedHit = RuleHit & { shadow: boolean; version?: number }

export type PlannedResponses = {
  investigate: { promptId: FocusId; maxTokens?: number; finding: ScanFinding }[]
  detonate: { phases: DetonatePhase[]; checkScript?: string } | null
  metaAlert: string[]
  snapshotTags: boolean
  shadow: { id: string; version: number }[]
  droppedResponses: number
}

// Live rules first, so the per-push cap drops shadow ones before anything that files.
export function forEvaluation(staged: StagedRule[]): { run: StagedRule[]; skipped: number } {
  const ordered = [...staged.filter((a) => !a.shadow), ...staged.filter((a) => a.shadow)]
  return { run: ordered.slice(0, MAX_ADVANCED_RULES_PER_PUSH), skipped: Math.max(0, ordered.length - MAX_ADVANCED_RULES_PER_PUSH) }
}

export const hitFinding = ({ rule, evidence }: RuleHit, repo: string): ScanFinding =>
  toFinding({ id: rule.id, severity: rule.severity, description: rule.description ?? rule.id }, repo, evidence.files, evidence.lines)

// Shadow hits only record. Live hits run their responses, capped across the push.
export function planResponses(hits: RoutedHit[], repo: string, sha: string): PlannedResponses {
  const plan: PlannedResponses = { investigate: [], detonate: null, metaAlert: [], snapshotTags: false, shadow: [], droppedResponses: 0 }
  let budget = MAX_RESPONSES_PER_PUSH
  for (const hit of hits) {
    const { rule, shadow } = hit
    if (shadow) {
      plan.shadow.push({ id: rule.id, version: hit.version ?? 0 })
      continue
    }
    for (const response of rule.responses ?? []) {
      if (budget === 0) {
        plan.droppedResponses++
        continue
      }
      budget--
      if ("investigate" in response) {
        plan.investigate.push({ promptId: response.investigate.focus, maxTokens: response.investigate.max_tokens, finding: hitFinding(hit, repo) })
      } else if ("detonate" in response) {
        const phases = new Set([...(plan.detonate?.phases ?? []), ...response.detonate.phases])
        plan.detonate = {
          phases: DETONATE_PHASES.filter((p) => phases.has(p)),
          checkScript: plan.detonate?.checkScript ?? response.detonate.check,
        }
      } else if ("meta_alert" in response) {
        plan.metaAlert.push(`${rule.description ?? rule.id} (${rule.id}) matched ${repo} at ${sha.slice(0, 7)}`)
      } else {
        plan.snapshotTags = true
      }
    }
  }
  return plan
}
