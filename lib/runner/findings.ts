import type { ScanFinding } from "@/lib/db/scans"
import type { RunnerJobDoc } from "@/lib/db/runner-jobs"
import { topSeverity, toFinding } from "@/lib/finding"
import { MAX_SCANNER_GROUPS, SUSPICIOUS_PROCESSES } from "@/lib/runner/limits"
import type { RunnerReport } from "@/schemas/runner"
import type { Severity } from "@/schemas/rule"

type Job = Pick<RunnerJobDoc, "repo" | "status" | "fetchedAt" | "result">

const rule = (id: string, severity: Severity, description: string) => ({ id, severity, description })
const prose = { prose: true }

// Null while the job is still running. Every other state yields at least one
// finding or an explicit clean report: silence never reads as clean.
export function runnerJobFindings(job: Job): ScanFinding[] | null {
  const { repo } = job
  if (job.status === "dispatched" || job.status === "fetched") return null
  if (job.status === "failed") {
    return [toFinding(rule("detonation-unavailable", "medium", "The runner could not be served the repository."), repo, [], [job.result?.error ?? "Unknown failure."], prose)]
  }
  if (job.status === "expired") {
    return job.fetchedAt
      ? [toFinding(rule("detonation-timed-out", "medium", "The runner fetched the repository and never reported."), repo, [], ["No report arrived before the report token expired."], prose)]
      : [toFinding(rule("detonation-unavailable", "medium", "No runner picked up the job."), repo, [], ["The fetch nonce expired unredeemed. Is the pushguard-runner workflow installed?"], prose)]
  }
  const report = job.result?.report
  if (!report) {
    const reasons = job.result?.suspect.length ? job.result.suspect : ["Reported with no body."]
    return [toFinding(rule("detonation-report-suspect", "high", "The runner sent a report that could not be read."), repo, [], reasons, prose)]
  }
  return reportFindings(repo, report, job.result?.suspect ?? [])
}

export function reportFindings(repo: string, report: RunnerReport, suspect: string[]): ScanFinding[] {
  const findings: ScanFinding[] = []
  const add = (id: string, severity: Severity, description: string, lines: string[], asProse = false) => {
    if (lines.length) findings.push(toFinding(rule(id, severity, description), repo, [], lines, asProse ? prose : {}))
  }

  add("detonation-report-suspect", "high", "The runner report failed sanity checks and may have been tampered with.", suspect, true)

  const installTimedOut = report.phases.some((p) => p.name === "install" && p.status === "timed_out")
  if (installTimedOut) add("install-exceeded-budget", "medium", "Dependency install did not finish within its budget.", ["Later phases saw a partial install."], true)
  const timedOut = report.phases.filter((p) => p.status === "timed_out" && p.name !== "install")
  add("detonation-timed-out", "medium", "A phase was cut off at its time budget.", timedOut.map((p) => `${p.name}: ${p.reason ?? "timed out"}`), true)
  const gaps = report.phases.filter((p) => p.status === "skipped" || p.status === "failed" || (p.status === "ran" && p.reason))
  add("detonation-phase-skipped", "low", "Part of the analysis did not run fully, so its absence of findings means less.", gaps.map((p) => `${p.name} ${p.status}: ${p.reason ?? "no reason given"}`), true)
  if (report.truncated) add("detonation-report-truncated", "low", "The runner observed more than the report can carry.", ["Observation lists were cut at their caps."], true)

  const { hosts, processes, envReads, writesOutsideProject, canaryTouches } = report.observations
  add("detonation-canary-touched", "critical", "Code read a planted credential during install, import or execute.", canaryTouches)
  add("detonation-network-attempt", "high", "Code tried to reach the network inside a sandbox that has none.", hosts)
  add("detonation-write-outside-project", "high", "Code wrote outside the project directory.", writesOutsideProject)
  add("detonation-env-read", "medium", "Code read a process environment it does not own.", envReads)
  const suspicious = processes.filter((path) => SUSPICIOUS_PROCESSES.has(path.split("/").pop() ?? ""))
  add("detonation-suspicious-process", "high", "Code launched a tool commonly used to fetch or run a second stage.", suspicious)

  findings.push(...scannerFindings(repo, report.scannerFindings))
  return findings
}

function scannerFindings(repo: string, results: RunnerReport["scannerFindings"]): ScanFinding[] {
  const groups = new Map<string, RunnerReport["scannerFindings"]>()
  for (const result of results) {
    const key = `scanner/${result.tool}/${result.ruleId}`
    groups.set(key, [...(groups.get(key) ?? []), result])
  }
  const findings = [...groups].slice(0, MAX_SCANNER_GROUPS).map(([id, group]) =>
    toFinding(
      rule(id, topSeverity(group.map((g) => g.severity)), group[0].message),
      repo,
      [...new Set(group.map((g) => g.file))],
      group.map((g) => `${g.file}:${g.line} ${g.message}`),
    ),
  )
  if (groups.size > MAX_SCANNER_GROUPS) {
    findings.push(toFinding(rule("scanner-findings-truncated", "low", "More scanner rules matched than are listed."), repo, [], [`${groups.size - MAX_SCANNER_GROUPS} further rule groups not shown.`], prose))
  }
  return findings
}
