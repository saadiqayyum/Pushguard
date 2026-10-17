import assert from "node:assert/strict"
import { test } from "node:test"
import { reportFindings, runnerJobFindings } from "@/lib/runner/findings"
import { suspectReasons } from "@/lib/runner/sanity"
import type { RunnerReport } from "@/schemas/runner"

const clean = (): RunnerReport => ({
  phases: [
    { name: "install", status: "ran", durationMs: 1000 },
    { name: "import", status: "ran", durationMs: 1000 },
    { name: "execute", status: "ran", durationMs: 1000 },
    { name: "scan", status: "ran", durationMs: 1000 },
  ],
  observations: { hosts: [], processes: [], envReads: [], writesOutsideProject: [], canaryTouches: [] },
  scannerFindings: [],
  truncated: false,
})

const ids = (report: RunnerReport, suspect: string[] = []) => reportFindings("acme/api", report, suspect).map((f) => f.ruleId)

test("a clean, plausible report passes sanity and yields nothing", () => {
  assert.deepEqual(suspectReasons(clean(), "detonate", 10_000), [])
  assert.deepEqual(ids(clean()), [])
})

test("out-of-order, missing and unexplained phases are suspect", () => {
  const report = clean()
  report.phases = [report.phases[1], report.phases[0], { name: "execute", status: "skipped", durationMs: 0 }]
  const reasons = suspectReasons(report, "detonate", 10_000)
  assert.ok(reasons.some((r) => r.includes("out of order")))
  assert.ok(reasons.some((r) => r.includes("scan is missing")))
  assert.ok(reasons.some((r) => r.includes("without a reason")))
})

test("durations over budget or over wall clock are suspect", () => {
  const report = clean()
  report.phases[0].durationMs = 3_000_000
  assert.ok(suspectReasons(report, "detonate", 10_000_000).some((r) => r.includes("over its budget")))
  assert.ok(suspectReasons(clean(), "detonate", 0).some((r) => r.includes("since fetch")) === false)
  const slow = clean()
  slow.phases.forEach((p) => (p.durationMs = 60_000))
  assert.ok(suspectReasons(slow, "detonate", 1_000).some((r) => r.includes("since fetch")))
})

test("a scan job may not claim to have run the payload", () => {
  assert.ok(suspectReasons(clean(), "scan", 10_000).some((r) => r.includes("scan-only")))
})

test("observations and blind spots each become findings", () => {
  const report = clean()
  report.phases[2] = { name: "execute", status: "skipped", reason: "isolate not installed", durationMs: 0 }
  report.phases[0] = { name: "install", status: "timed_out", reason: "budget", durationMs: 600_000 }
  report.observations.hosts = ["evil.example:443"]
  report.observations.canaryTouches = ["/home/dev/.ssh/id_ed25519"]
  report.observations.processes = ["/usr/bin/node", "/usr/bin/curl"]
  report.truncated = true
  const got = ids(report, ["tampered"])
  for (const id of [
    "detonation-report-suspect",
    "install-exceeded-budget",
    "detonation-phase-skipped",
    "detonation-report-truncated",
    "detonation-network-attempt",
    "detonation-canary-touched",
    "detonation-suspicious-process",
  ]) assert.ok(got.includes(id), id)
  const proc = reportFindings("acme/api", report, []).find((f) => f.ruleId === "detonation-suspicious-process")
  assert.deepEqual(proc?.lines, ["/usr/bin/curl"])
})

test("scanner results group by tool and rule with the loudest severity", () => {
  const report = clean()
  report.scannerFindings = [
    { tool: "semgrep", ruleId: "eval", severity: "medium", file: "a.js", line: 1, message: "eval" },
    { tool: "semgrep", ruleId: "eval", severity: "high", file: "b.js", line: 2, message: "eval" },
    { tool: "gitleaks", ruleId: "aws", severity: "high", file: "c.env", line: 3, message: "AWS key" },
  ]
  const findings = reportFindings("acme/api", report, [])
  assert.equal(findings.length, 2)
  assert.equal(findings[0].ruleId, "scanner/semgrep/eval")
  assert.equal(findings[0].severity, "high")
  assert.deepEqual(findings[0].files, ["a.js", "b.js"])
})

test("silence is never clean", () => {
  const base = { repo: "acme/api", result: null }
  assert.equal(runnerJobFindings({ ...base, status: "fetched", fetchedAt: new Date() }), null)
  assert.equal(runnerJobFindings({ ...base, status: "expired", fetchedAt: null })?.[0].ruleId, "detonation-unavailable")
  assert.equal(runnerJobFindings({ ...base, status: "expired", fetchedAt: new Date() })?.[0].ruleId, "detonation-timed-out")
  assert.equal(
    runnerJobFindings({ ...base, status: "reported", fetchedAt: new Date(), result: { suspect: ["bad schema"] } })?.[0].ruleId,
    "detonation-report-suspect",
  )
})
