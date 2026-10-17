import { queueScanFiling, readableScan } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { respond, userRoute } from "@/lib/route"
import { fileScanBody } from "@/schemas/api"
import { filingQueuedOut } from "@/schemas/output"

export const POST = userRoute("/api/scans/[id]/file", async (request, { params }, { login }) => {
  const { id } = await params
  const body = fileScanBody.parse(await request.json().catch(() => ({})))
  const scan = await readableScan(id, login)
  if (!scan) throw new AppError("not_found", "Scan not found")
  if (scan.status !== "done") throw new AppError("validation_failed", "Scan has not finished")
  await queueScanFiling(scan.id, body.repos ?? null)
  return respond(filingQueuedOut, { queued: true }, { status: 202 })
})
