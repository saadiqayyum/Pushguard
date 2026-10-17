import { respond, userRoute } from "@/lib/route"
import { resolveRequester, scanTargets } from "@/lib/scan"
import { scanTargetsOut } from "@/schemas/output"

export const GET = userRoute("/api/scan-targets", async () => {
  const targets = await scanTargets(await resolveRequester())
  return respond(
    scanTargetsOut,
    targets.map(({ installation, repos }) => ({
      installationId: installation.id,
      account: installation.account,
      accountType: installation.accountType,
      repos,
    })),
  )
})
