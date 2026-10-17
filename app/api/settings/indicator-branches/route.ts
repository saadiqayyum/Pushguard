import { activeInstallation, setIndicatorBranches } from "@/lib/db"
import { logger } from "@/lib/logger"
import { respond, userRoute } from "@/lib/route"
import { requireAdmin } from "@/lib/tenant"
import { indicatorBranchesBody, indicatorBranchesOut } from "@/schemas/settings"

export const GET = userRoute("/api/settings/indicator-branches", async () => {
  const { org } = await requireAdmin()
  return respond(indicatorBranchesOut, { branches: (await activeInstallation(org))?.indicatorBranches ?? [] })
})

export const PUT = userRoute("/api/settings/indicator-branches", async (request) => {
  const { branches } = indicatorBranchesBody.parse(await request.json())
  const { org, login } = await requireAdmin()
  const unique = [...new Set(branches)]
  await setIndicatorBranches(org, unique)
  logger.info("indicator_branches_set", { org, by: login, count: unique.length })
  return respond(indicatorBranchesOut, { branches: unique })
})
