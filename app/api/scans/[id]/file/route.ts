import { NextResponse } from "next/server"
import { AppError } from "@/lib/errors"
import { withErrorHandler } from "@/lib/route"
import { fileScanFindings, readableScan, resolveRequester } from "@/lib/scan"
import { fileScanBody } from "@/schemas/api"

export const maxDuration = 60

export const POST = withErrorHandler("/api/scans/[id]/file", async (request, { params }) => {
  const { id } = await params
  const requester = await resolveRequester()
  const body = fileScanBody.parse(await request.json().catch(() => ({})))

  const scan = await readableScan(id, requester.login)
  if (!scan) throw new AppError("not_found", "Scan not found")

  return NextResponse.json({ data: await fileScanFindings(scan, requester, body.repos) })
})
