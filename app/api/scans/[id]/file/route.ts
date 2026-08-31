import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { withErrorHandler } from "@/lib/route"
import { canReadScan, fileScanFindings, resolveRequester } from "@/lib/scan"
import { fileScanBody } from "@/schemas/api"

export const maxDuration = 60

export const POST = withErrorHandler("/api/scans/[id]/file", async (request, { params }) => {
  const { id } = await params
  const requester = await resolveRequester()
  const body = fileScanBody.parse(await request.json().catch(() => ({})))

  const scan = await db.scans().findOne({ _id: id })
  if (!scan || !canReadScan(scan, requester.login)) throw new AppError("not_found", "Scan not found")

  return NextResponse.json({ data: await fileScanFindings(scan, requester, body.repos) })
})
