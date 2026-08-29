import { NextResponse } from "next/server"
import { requireMember } from "@/lib/auth"
import { installationsCollection, serializeInstallation } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { withErrorHandler } from "@/lib/route"
import { updateInstallationBody } from "@/schemas/api"

export const PATCH = withErrorHandler("/api/installations/[org]", async (request, { params }) => {
  const { org } = await params
  const user = await requireMember(org)
  const body = updateInstallationBody.parse(await request.json())

  const collection = await installationsCollection()
  const existing = await collection.findOne({ org, active: true })
  if (!existing) throw new AppError("not_found", "Installation not found")

  // Only repos this installation actually covers may collect alerts; anything
  // else would leak findings to a repo outside the app's scope.
  if (body.alertsRepo && !(existing.repos ?? []).includes(body.alertsRepo)) {
    throw new AppError("validation_failed", `Pushguard is not installed on ${body.alertsRepo}`)
  }

  // Mentions must resolve to a known team or the account itself, so a typo
  // cannot silently turn a high-severity alert into a plain-text no-op.
  if (body.alertMention) {
    const target = body.alertMention.replace(/^@/, "")
    const allowed = [org, existing.installedBy, ...(existing.teams ?? [])]
    if (!allowed.includes(target)) {
      throw new AppError("validation_failed", `Unknown mention target ${target}`)
    }
  }

  await collection.updateOne(
    { org },
    {
      $set: {
        alertsRepo: body.alertsRepo === "" ? null : body.alertsRepo ?? existing.alertsRepo,
        alertMention: body.alertMention === "" ? null : body.alertMention ?? existing.alertMention,
        updatedAt: new Date(),
      },
    },
  )

  const updated = await collection.findOne({ org })
  logger.info("installation_updated", { org, by: user.login })
  return NextResponse.json({ data: serializeInstallation(updated!) })
})
