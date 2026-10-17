import { NextResponse } from "next/server"
import { asSystem } from "@/lib/db/client"
import { enqueueJob } from "@/lib/db"
import { acceptReport, runnerJobForReport } from "@/lib/db/runner-jobs"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { withErrorHandler } from "@/lib/route"
import { limitRunner, readBody } from "@/lib/runner/guard"
import { REPORT_MAX_BYTES } from "@/lib/runner/limits"
import { suspectReasons } from "@/lib/runner/sanity"
import { runnerReportSchema } from "@/schemas/runner"

export const POST = withErrorHandler("/api/runner/report", async (request) =>
  asSystem(async () => {
    await limitRunner(request)
    const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") ?? "")?.[1]
    if (!token) throw new AppError("unauthorized", "Bad credentials")
    const job = await runnerJobForReport(token)
    if (!job?.fetchedAt) throw new AppError("unauthorized", "Bad credentials")

    const parsed = runnerReportSchema.safeParse(await readBody(request, REPORT_MAX_BYTES))
    const suspect = parsed.success
      ? suspectReasons(parsed.data, job.kind, Date.now() - job.fetchedAt.getTime())
      : [`The report did not match the schema: ${parsed.error.issues.slice(0, 3).map((i) => i.path.join(".")).join(", ")}.`]
    const id = await acceptReport(token, { report: parsed.data, suspect })
    if (!id) throw new AppError("unauthorized", "Bad credentials")
    logger.info("runner_reported", { jobId: id, repo: job.repo, suspect: suspect.length })
    await enqueueJob({ type: "runner_report", jobId: id })
    return new NextResponse(null, { status: 204 })
  }),
)
