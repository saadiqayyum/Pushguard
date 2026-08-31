import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"
import { db, activeInstallation, canWriteRepo, noteAlertActivity, setAlertsArchived } from "@/lib/db"
import { closeIssue } from "@/lib/github"
import { logger } from "@/lib/logger"
import { withErrorHandler } from "@/lib/route"
import { bulkAlertsBody } from "@/schemas/api"

export const maxDuration = 60

// Bulk triage.
export const POST = withErrorHandler("/api/alerts/bulk", async (request) => {
  const user = await requireUser()
  const { ids, action } = bulkAlertsBody.parse(await request.json())

  if (action !== "close") {
    const moved = await setAlertsArchived(user.login, ids, action === "archive")
    logger.info("alerts_archived", { by: user.login, action, count: moved })
    return NextResponse.json({ data: { done: moved, failed: [] } })
  }

  const rows = await db.alerts().find({ _id: { $in: ids } }).toArray()
  const failed: { id: string; reason: string }[] = []
  let done = 0

  for (const alert of rows) {
    try {
      if (!(await canWriteRepo(user.login, alert.repo))) {
        throw new Error("You do not have permission to close issues here")
      }
      const installation = await activeInstallation(alert.org)
      if (!installation) throw new Error("Pushguard is not installed on this account")

      await closeIssue(installation.installationId, alert.repo, alert.number)
      await noteAlertActivity(alert.repo, alert.number, {
        state: "closed",
        by: user.login,
        action: "closed",
      })
      done++
    } catch (error) {
      failed.push({ id: alert._id, reason: error instanceof Error ? error.message : "Could not close" })
    }
  }

  logger.info("alerts_closed", { by: user.login, done, failed: failed.length })
  return NextResponse.json({ data: { done, failed } })
})
