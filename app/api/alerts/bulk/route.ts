import { activeInstallation, alertsByIds, canWriteRepo, setAlertsArchived } from "@/lib/db"
import { closeIssue } from "@/lib/github"
import { logger } from "@/lib/logger"
import { respond, userRoute } from "@/lib/route"
import { requireTenant } from "@/lib/tenant"
import { bulkAlertsBody } from "@/schemas/api"
import { bulkResultOut } from "@/schemas/output"

export const maxDuration = 60

// Closing goes to GitHub only; the issues webhook mirrors the new state back.
export const POST = userRoute("/api/alerts/bulk", async (request) => {
  const { ids, action } = bulkAlertsBody.parse(await request.json())
  const { login } = await requireTenant()
  const keys = ids.map((id) => {
    const [repo, number] = id.split("#")
    return { repo, number: Number(number) }
  })

  if (action !== "close") {
    const done = await setAlertsArchived(login, keys, action === "archive")
    logger.info("alerts_archived", { by: login, action, count: done })
    return respond(bulkResultOut, { done, failed: [] })
  }

  const readable = await alertsByIds(login, keys)
  const found = new Set(readable.map((alert) => `${alert.repo}#${alert.number}`))
  const failed = ids.filter((id) => !found.has(id)).map((id) => ({ id, reason: "Not found" }))
  let done = 0

  for (const alert of readable) {
    const id = `${alert.repo}#${alert.number}`
    try {
      if (!(await canWriteRepo(login, alert.repo))) {
        failed.push({ id, reason: "You cannot close issues in this repository" })
        continue
      }
      const installation = await activeInstallation(alert.org)
      if (!installation) {
        failed.push({ id, reason: "Pushguard is not installed on this account" })
        continue
      }
      await closeIssue(installation.installationId, alert.repo, alert.number)
      done++
    } catch (error) {
      logger.warn("alert_close_failed", { id, error: error instanceof Error ? error.message : String(error) })
      failed.push({ id, reason: "Could not close on GitHub" })
    }
  }

  logger.info("alerts_closed", { by: login, done, failed: failed.length })
  return respond(bulkResultOut, { done, failed })
})
