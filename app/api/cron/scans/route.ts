import { NextResponse } from "next/server"
import { env } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { withErrorHandler } from "@/lib/route"
import { reconcileAccess } from "@/lib/access"
import { drainScans } from "@/lib/scan"

export const maxDuration = 60

// Recovery, not the main path: a scan normally runs in the invocation that
// queued it. This picks up whatever that invocation dropped.
export const GET = withErrorHandler("/api/cron/scans", async (request) => {
  const secret = env().CRON_SECRET
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    throw new AppError("unauthorized", "Bad cron credentials")
  }
  // Reconciliation is the safety net under the access projection: GitHub does
  // not emit an event for every way access can change, and a delivery can fail,
  // so the collaborator lists are re-read on a schedule rather than trusted
  // forever. This is a background job, never a request the browser makes.
  const [ran, reconciled] = await Promise.all([drainScans(), reconcileAccess()])
  return NextResponse.json({ data: { ran, reconciled } })
})
