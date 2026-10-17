import { PHASE_BUDGET_MS, PHASE_SLACK_MS } from "@/lib/runner/limits"
import { RUNNER_PHASES, type RunnerKind, type RunnerPhase, type RunnerReport } from "@/schemas/runner"

const REQUIRED: Record<RunnerKind, RunnerPhase[]> = {
  detonate: ["install", "import", "execute", "scan"],
  scan: ["scan"],
}

// The report comes from a machine the payload ran on. Reasons it should not be
// taken at its word; any reason marks the result suspect.
export function suspectReasons(report: RunnerReport, kind: RunnerKind, wallMs: number): string[] {
  const reasons: string[] = []
  const order = report.phases.map((phase) => RUNNER_PHASES.indexOf(phase.name))
  if (order.some((at, i) => i > 0 && at <= order[i - 1])) reasons.push("Phases are out of order or repeated.")

  for (const name of REQUIRED[kind]) {
    if (!report.phases.some((phase) => phase.name === name)) reasons.push(`Required phase ${name} is missing.`)
  }
  for (const phase of report.phases) {
    if (phase.status !== "ran" && !phase.reason?.trim()) reasons.push(`Phase ${phase.name} ${phase.status} without a reason.`)
    if (phase.durationMs > PHASE_BUDGET_MS[phase.name] + PHASE_SLACK_MS) {
      reasons.push(`Phase ${phase.name} claims ${phase.durationMs} ms, over its budget.`)
    }
    if (kind === "scan" && phase.name !== "scan" && phase.status === "ran") {
      reasons.push(`A scan-only job reports running ${phase.name}.`)
    }
  }

  const claimed = report.phases.reduce((sum, phase) => sum + phase.durationMs, 0)
  if (claimed > wallMs + PHASE_SLACK_MS) reasons.push(`Phases claim ${claimed} ms but only ${wallMs} ms passed since fetch.`)
  return reasons
}
