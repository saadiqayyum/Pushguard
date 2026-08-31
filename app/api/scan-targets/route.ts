import { NextResponse } from "next/server"
import { withErrorHandler } from "@/lib/route"
import { resolveRequester, scanTargets } from "@/lib/scan"

// What the picker is allowed to show: installations of this app that the.
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
