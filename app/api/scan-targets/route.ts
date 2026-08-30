import { NextResponse } from "next/server"
import { withErrorHandler } from "@/lib/route"
import { resolveRequester, scanTargets } from "@/lib/scan"

// What the picker is allowed to show: installations of this app that the
// signed-in user can see, and within each, only the repositories GitHub says
// they have read access to. The same call re-runs at enqueue, so this is a
// convenience rather than the boundary.
export const GET = withErrorHandler("/api/scan-targets", async () => {
  const targets = await scanTargets(await resolveRequester())
  return NextResponse.json({
    data: targets.map(({ installation, repos }) => ({
      installationId: installation.id,
      account: installation.account,
      accountType: installation.accountType,
      repos,
    })),
  })
})
