import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { scansCollection, serializeScan } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { withErrorHandler } from "@/lib/route"
import { canReadScan } from "@/lib/scan"

export const GET = withErrorHandler("/api/scans/[id]", async (_request, { params }) => {
  const { id } = await params
  const session = await auth()
  const scan = await (await scansCollection()).findOne({ _id: id })
  // Same answer for a scan that never existed and one that is not yours. A scan
  // quotes source from private repositories; its id is not a capability.
  if (!scan || !canReadScan(scan, session?.login ?? null)) {
    throw new AppError("not_found", "Scan not found")
  }
  return NextResponse.json({ data: serializeScan(scan) })
})
