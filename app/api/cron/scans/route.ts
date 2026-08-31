import { NextResponse } from "next/server"
import { env } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { withErrorHandler } from "@/lib/route"
import { reconcileAccess } from "@/lib/access"
import { drainScans } from "@/lib/scan"
import { drainIndexJobs } from "@/lib/code-index"
import { drainReviewSessions } from "@/lib/review-session"

export const maxDuration = 60

// Recovery, not the main path: a scan normally runs in the invocation that
// queued it. This picks up whatever that invocation dropped.
export const GET = withErrorHandler("/api/cron/scans", async (request) => {
  const secret = env().CRON_SECRET
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    throw new AppError("unauthorized", "Bad cron credentials")
  }
  const [ran, reconciled] = await Promise.all([drainScans(), reconcileAccess()])
  const indexed = await drainIndexJobs()
  const reviewed = await drainReviewSessions()
  return NextResponse.json({ data: { ran, reconciled, indexed, reviewed } })
})
