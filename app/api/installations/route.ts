import { NextResponse } from "next/server"
import { memberScopes, requireUser } from "@/lib/auth"
import { installationsCollection, serializeInstallation } from "@/lib/db"
import { withErrorHandler } from "@/lib/route"

export const GET = withErrorHandler("/api/installations", async () => {
  const user = await requireUser()
  const docs = await (await installationsCollection())
    .find({ org: { $in: memberScopes(user) }, active: true })
    .toArray()
  return NextResponse.json({ data: docs.map(serializeInstallation) })
})
