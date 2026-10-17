import type { ScanFinding } from "@/lib/db/scans"
import { expireRunnerJobs, runnerJob } from "@/lib/db/runner-jobs"
import { runnerJobFindings } from "@/lib/runner/findings"
import { MAX_EXPIRED_PER_SWEEP } from "@/lib/runner/limits"

// Null while the runner is still working.
export async function runnerFindings(jobId: string): Promise<ScanFinding[] | null> {
  const job = await runnerJob(jobId)
  return job ? runnerJobFindings(job) : null
}

// Jobs that went silent, each with the finding that says so. Run from a sweep.
export async function expiredRunnerFindings(): Promise<{ jobId: string; repo: string; sha: string; findings: ScanFinding[] }[]> {
  const jobs = await expireRunnerJobs(MAX_EXPIRED_PER_SWEEP)
  return jobs.map((job) => ({ jobId: job.id, repo: job.repo, sha: job.sha, findings: runnerJobFindings(job) ?? [] }))
}
