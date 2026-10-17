import { serializeScan } from "@/lib/db"
import { respond, userRoute } from "@/lib/route"
import { enqueueScan, resolveRequester } from "@/lib/scan"
import { requireTenant } from "@/lib/tenant"
import { createScanBody } from "@/schemas/api"
import { scanOut } from "@/schemas/output"

// Queued only. The job runner picks it up; nothing runs in this request.
export const POST = userRoute("/api/scans", async (request) => {
  const body = createScanBody.parse(await request.json())
  await requireTenant()
  const scan = await enqueueScan(await resolveRequester(), body)
  return respond(scanOut, serializeScan(scan))
})
