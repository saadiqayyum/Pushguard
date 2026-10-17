import { readableScan, serializeScan } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { respond, userRoute } from "@/lib/route"
import { scanOut } from "@/schemas/output"

// A scan is private to whoever ran it; someone else's id answers 404.
export const GET = userRoute("/api/scans/[id]", async (_request, { params }, { login }) => {
  const { id } = await params
  const scan = await readableScan(id, login)
  if (!scan) throw new AppError("not_found", "Scan not found")
  return respond(scanOut, serializeScan(scan))
})
