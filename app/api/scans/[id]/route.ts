import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"
import { serializeScan } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { withErrorHandler } from "@/lib/route"
import { readableScan } from "@/lib/scan"

export const GET = withErrorHandler("/api/scans/[id]", async (_request, { params }) => {
  const { id } = await params
  const { login } = await requireUser()
  const scan = await readableScan(id, login)
  if (!scan) throw new AppError("not_found", "Scan not found")
  return NextResponse.json({ data: serializeScan(scan) })
})
