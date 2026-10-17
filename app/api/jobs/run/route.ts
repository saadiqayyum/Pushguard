import { NextResponse } from "next/server"
import { asSystem, hit } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { JOB_RUN_BUDGET_MS, JOBS_RUN_PER_MINUTE, JOBS_RUN_WINDOW_SECONDS } from "@/lib/jobs/limits"
import { runJobs } from "@/lib/jobs/run"
import { requireBearer } from "@/lib/machine-auth"
import { withErrorHandler } from "@/lib/route"

export const maxDuration = 300

// Called by pg_net when a job is enqueued or comes due. See drizzle/0002.
export const POST = withErrorHandler("/api/jobs/run", async (request) => {
  requireBearer(request)
  const data = await asSystem(async () => {
    const { count, resetIn } = await hit("jobs-run", JOBS_RUN_WINDOW_SECONDS)
    if (count > JOBS_RUN_PER_MINUTE) {
      throw new AppError("rate_limited", "Too many job runs", { retryAfterSeconds: resetIn })
    }
    return runJobs(JOB_RUN_BUDGET_MS)
  })
  return NextResponse.json({ data })
})
