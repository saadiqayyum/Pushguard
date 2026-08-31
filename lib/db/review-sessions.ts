import type { Severity } from "@/schemas/rule"
import { defineCollection } from "./client"
import type { ScanFinding } from "./scans"

// A repository-scope review, pinned to one commit and resumed across
// invocations. Holds paths and progress, never source.
export type ReviewSessionDoc = {
  _id: string
  owner: string
  installationId: number
  repo: string
  branch: string
  sha: string
  // Re-derives the diff at run time; source is never stored here.
  baseSha?: string
  source: "push" | "scan"
  rules: {
    id: string
    prompt: string
    severity: Severity
    paths?: string[]
    exclude_paths?: string[]
    budget: number
    key?: string
    done: boolean
  }[]
  seeds: string[]
  findings: ScanFinding[]
  status: "queued" | "running" | "done" | "failed"
  attempts: number
  error?: string
  createdAt: Date
  startedAt?: Date
  finishedAt?: Date
}

export const reviewSessions = defineCollection<ReviewSessionDoc>("review_sessions", [
  { keys: { status: 1, createdAt: 1 } },
  { keys: { owner: 1, createdAt: -1 } },
  // One live session per repository, so a burst of pushes cannot queue a
  // hundred whole-repository reviews of the same code.
  {
    keys: { repo: 1 },
    options: { unique: true, partialFilterExpression: { status: "queued" } },
  },
])
