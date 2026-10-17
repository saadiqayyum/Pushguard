import { deleteSink } from "@/lib/db/alert-sinks"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { respond, userRoute } from "@/lib/route"
import { requireAdmin } from "@/lib/tenant"
import { nothingOut } from "@/schemas/output"

export const DELETE = userRoute("/api/alert-sinks/[id]", async (_request, { params }) => {
  const { id } = await params
  const { org, login } = await requireAdmin()
  if (!(await deleteSink(org, id))) throw new AppError("not_found", "No such destination")
  logger.info("alert_sink_removed", { org, by: login })
  return respond(nothingOut, null)
})
