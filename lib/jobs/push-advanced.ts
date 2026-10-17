import { MAX_INTEL_ROWS } from "@/lib/code-intel/limits"
import type { AttackPath } from "@/lib/code-intel"
import { enqueueJob, factHistory, insertShadowHit, liveFacts, type InstallationDoc, type ScanFinding } from "@/lib/db"
import type { ConfirmedMatch, PushContext } from "@/lib/engine"
import type { FiledRef } from "@/lib/escalate"
import { toFinding } from "@/lib/finding"
import type { Indicator } from "@/lib/indicators"
import { queueInvestigation } from "@/lib/investigator"
import { logger } from "@/lib/logger"
import { metaAlert } from "@/lib/meta-alerts"
import type { ShadowRule } from "@/lib/platform/staff-rules"
import { evaluateAdvanced, leavesOf, type AdvancedInput } from "@/lib/rules/advanced/evaluate"
import { forEvaluation, hitFinding, planResponses, type PlannedResponses, type RoutedHit, type StagedRule } from "@/lib/rules/advanced/plan"
import type { PushDiff } from "@/lib/push-diff"
import { MAX_WITHIN_DAYS } from "@/schemas/rule-advanced"
import type { Rule } from "@/schemas/rule"
import type { PushPayload } from "@/schemas/webhook"

const CAPPED = {
  id: "rules-capped",
  severity: "low" as const,
  description: "Not every rule was evaluated or had its responses run for this push",
}

// Rules the pattern engine cannot answer alone: advanced ones, and staff shadow versions.
export function stagedRules(active: Rule[], shadow: ShadowRule[]): StagedRule[] {
  return [...active.filter((r) => r.advanced).map((rule) => ({ rule, shadow: false })), ...shadow.map((s) => ({ rule: s.rule, shadow: true, version: s.version }))]
}

// Decided before any GitHub call, so the plan knows whether the shared compare is needed.
export function stageNeeds(staged: StagedRule[]): { lines: boolean; facts: boolean; history: boolean } {
  const needs = { lines: false, facts: false, history: false }
  for (const { rule } of staged) {
    const groups = [rule, ...(rule.any_of ?? [])]
    if (groups.some((g) => g.added_lines || g.unicode_risk)) needs.lines = true
    for (const leaf of rule.advanced ? leavesOf(rule.advanced.when) : []) {
      if ("lines" in leaf) needs.lines = true
      if ("facts" in leaf) needs[rule.advanced?.within ? "history" : "facts"] = true
    }
  }
  return needs
}

// Facts describe the default branch, so a push elsewhere evaluates with none.
// `matched` are the pattern engine's confirmed matches, whose responses run here too.
export async function advancedStage(input: {
  staged: StagedRule[]
  matched: ConfirmedMatch[]
  payload: PushPayload
  context: PushContext
  diff: PushDiff | null
  rules: string[]
  paths: AttackPath[]
  indicators: Indicator[]
  onDefault: boolean
}): Promise<{ findings: ScanFinding[]; plan: PlannedResponses | null }> {
  const { payload } = input
  const repo = payload.repository.full_name
  const responding: RoutedHit[] = input.matched
    .filter((m) => m.rule.responses)
    .map((m) => ({ rule: m.rule, evidence: { files: m.matchedFiles, lines: m.matchedLines }, shadow: false }))
  if (input.staged.length === 0 && responding.length === 0) return { findings: [], plan: null }

  const { run, skipped } = forEvaluation(input.staged)
  const needs = stageNeeds(run)
  const touched = input.context.files.filter((f) => f.changeType !== "removed").map((f) => f.path)
  const [facts, history] = await Promise.all([
    input.onDefault && needs.facts && touched.length > 0 ? liveFacts(repo, { paths: touched, limit: MAX_INTEL_ROWS }) : [],
    input.onDefault && needs.history ? factHistory(repo, { sinceDays: MAX_WITHIN_DAYS, limit: MAX_INTEL_ROWS }) : [],
  ])
  const evaluation: AdvancedInput = {
    push: input.context,
    added: input.diff?.addedLines ?? new Map(),
    removed: input.diff?.removedLines ?? new Map(),
    rules: input.rules,
    facts,
    history,
    pushed: [...payload.commits.map((c) => c.id), payload.after],
    paths: input.paths,
    indicators: input.indicators,
  }
  const hits: RoutedHit[] = []
  for (const { rule, shadow, version } of run) {
    const hit = evaluateAdvanced(rule, evaluation)
    if (hit) hits.push({ ...hit, shadow, version })
  }
  const plan = planResponses([...responding, ...hits], repo, payload.after)
  for (const s of plan.shadow) {
    await insertShadowHit(s.id, s.version, repo, payload.after).catch((error: unknown) =>
      logger.warn("rule_shadow_hit_failed", { ruleId: s.id, version: s.version, error: String(error) }),
    )
  }
  logger.info("advanced_rules_evaluated", { repo, evaluated: run.length, skipped, hits: hits.map((h) => `${h.rule.id}${h.shadow ? `@${h.version}:shadow` : ""}`) })
  const capped =
    skipped > 0 || plan.droppedResponses > 0
      ? [toFinding(CAPPED, repo, [], [`${skipped} rule(s) not evaluated and ${plan.droppedResponses} response(s) not run: over the per-push cap.`], { prose: true })]
      : []
  return { findings: [...hits.filter((h) => !h.shadow).map((h) => hitFinding(h, repo)), ...capped], plan }
}

// After filing: investigations escalate onto the filed alert; the rest stand alone.
export async function responseFollowUps(installation: InstallationDoc, payload: PushPayload, plan: PlannedResponses | null, filed: FiledRef | null): Promise<void> {
  if (!plan) return
  const repo = payload.repository.full_name
  if (filed) {
    for (const { promptId, maxTokens, finding } of plan.investigate) {
      await queueInvestigation(installation, { repo, sha: payload.after, target: filed.target, issue: filed.number, redact: filed.redact, findings: [finding], focus: { promptId, maxTokens } })
    }
  }
  if (plan.metaAlert.length > 0) await metaAlert("rule_hit", installation.org, plan.metaAlert)
  if (plan.snapshotTags) await enqueueJob({ type: "tag_snapshot", repo })
}
