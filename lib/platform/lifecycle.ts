import { OVERRIDE_REASON_MAX, OVERRIDE_REASON_MIN, SHADOW_MIN_MS } from "./limits"

export const STATUSES = ["draft", "review", "shadow", "published", "internal", "retired"] as const
export type Status = (typeof STATUSES)[number]

export const TRANSITIONS: Record<Status, readonly Status[]> = {
  draft: ["review", "retired"],
  review: ["draft", "shadow", "retired"],
  shadow: ["published", "internal", "draft", "retired"],
  published: ["retired"],
  internal: ["published", "retired"],
  retired: [],
}

// Statuses the engine runs, so each one needs a signature it can verify.
export const LIVE_STATUSES: readonly Status[] = ["shadow", "published", "internal"]

export type GateEvidence = {
  schemaProblems: string[]
  regexProblems: string[]
  fixtures: { passed: boolean; failures: string[] } | null
  shadowSince: Date | null
}

export type TransitionRequest = { from: Status; to: Status; now: Date; override?: string }
export type GateVerdict = { ok: true; overridden: boolean } | { ok: false; problems: string[] }

// Pure: every check the console applies before a status change. Moving back
// (to draft or retired) is never gated; moving forward is.
export function checkTransition(request: TransitionRequest, evidence: GateEvidence): GateVerdict {
  const { from, to } = request
  if (!TRANSITIONS[from].includes(to)) return { ok: false, problems: [`Cannot move from ${from} to ${to}`] }
  if (to === "draft" || to === "retired") return { ok: true, overridden: false }

  const problems = [...evidence.schemaProblems, ...evidence.regexProblems]
  if (evidence.fixtures && !evidence.fixtures.passed) {
    problems.push(...(evidence.fixtures.failures.length ? evidence.fixtures.failures : ["Fixtures failed"]))
  }
  if (to !== "published") return problems.length ? { ok: false, problems } : { ok: true, overridden: false }

  const shadowedLongEnough =
    evidence.shadowSince !== null && request.now.getTime() - evidence.shadowSince.getTime() >= SHADOW_MIN_MS
  const reason = request.override?.trim() ?? ""
  const overridden = !shadowedLongEnough && reason.length >= OVERRIDE_REASON_MIN && reason.length <= OVERRIDE_REASON_MAX
  if (!shadowedLongEnough && !overridden) {
    problems.push(
      `Needs ${SHADOW_MIN_MS / 86_400_000} days in shadow, or an override reason of ${OVERRIDE_REASON_MIN} to ${OVERRIDE_REASON_MAX} characters`,
    )
  }
  return problems.length ? { ok: false, problems } : { ok: true, overridden }
}
