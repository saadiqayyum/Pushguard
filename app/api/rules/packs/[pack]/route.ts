import { setPackDisabled } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { PACKS } from "@/lib/rules/catalog"
import { respond, userRoute } from "@/lib/route"
import { requireAdmin } from "@/lib/tenant"
import { setPackBody } from "@/schemas/api"
import { packStateOut } from "@/schemas/output"

export const PATCH = userRoute("/api/rules/packs/[pack]", async (request, { params }) => {
  const { pack } = await params
  const { enabled } = setPackBody.parse(await request.json())
  const { org, login } = await requireAdmin()
  if (!PACKS.some((entry) => entry.id === pack)) throw new AppError("not_found", "Pack not found")

  await setPackDisabled(org, pack, !enabled, login)
  logger.info("pack_changed", { org, pack, enabled, by: login })
  return respond(packStateOut, { pack, enabled })
})
