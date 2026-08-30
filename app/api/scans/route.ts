import { NextResponse, after } from "next/server"
import { serializeScan } from "@/lib/db"
import { withErrorHandler } from "@/lib/route"
import { enqueueScan, resolveRequester, runScan } from "@/lib/scan"
import { createScanBody } from "@/schemas/api"

// The scan runs in this invocation, after the response: the queue row and the
// cron drain exist to recover the scans that outlive it, not to start them.
export const maxDuration = 60

export const POST = withErrorHandler("/api/scans", async (request) => {
  const requester = await resolveRequester()
  const scan = await enqueueScan(requester, createScanBody.parse(await request.json()))
  if (scan.status === "queued") after(() => runScan(scan._id))
  return NextResponse.json({ data: serializeScan(scan) })
})
