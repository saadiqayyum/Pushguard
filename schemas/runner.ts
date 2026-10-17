import { z } from "zod"
import { SEVERITIES } from "./rule"

// Mirrored in detonator/report.go: the binary truncates to these before sending.
export const MAX_OBSERVATIONS = 500
export const MAX_SCANNER_FINDINGS = 500
export const MAX_OBSERVATION_LENGTH = 1024
export const MAX_REASON_LENGTH = 600
// "check:" plus a 64-character script id.
export const MAX_TOOL_LENGTH = 80
const MAX_PHASES = 8
const MAX_PHASE_MS = 3_600_000

export const RUNNER_KINDS = ["scan", "detonate"] as const
export const RUNNER_PHASES = ["install", "import", "execute", "check", "scan"] as const
export type RunnerKind = (typeof RUNNER_KINDS)[number]
export type RunnerPhase = (typeof RUNNER_PHASES)[number]

const observation = z.array(z.string().max(MAX_OBSERVATION_LENGTH)).max(MAX_OBSERVATIONS)

export const runnerFetchSchema = z.object({ nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict()

export const runnerReportSchema = z
  .object({
    phases: z
      .array(
        z
          .object({
            name: z.enum(RUNNER_PHASES),
            status: z.enum(["ran", "skipped", "timed_out", "failed"]),
            reason: z.string().max(MAX_REASON_LENGTH).optional(),
            durationMs: z.number().int().min(0).max(MAX_PHASE_MS),
          })
          .strict(),
      )
      .max(MAX_PHASES),
    observations: z
      .object({
        hosts: observation,
        processes: observation,
        envReads: observation,
        writesOutsideProject: observation,
        canaryTouches: observation,
      })
      .strict(),
    scannerFindings: z
      .array(
        z
          .object({
            tool: z.string().max(MAX_TOOL_LENGTH),
            ruleId: z.string().max(200),
            severity: z.enum(SEVERITIES),
            file: z.string().max(MAX_OBSERVATION_LENGTH),
            line: z.number().int().min(0).max(10_000_000),
            message: z.string().max(MAX_REASON_LENGTH),
          })
          .strict(),
      )
      .max(MAX_SCANNER_FINDINGS),
    truncated: z.boolean(),
  })
  .strict()

export type RunnerReport = z.infer<typeof runnerReportSchema>
