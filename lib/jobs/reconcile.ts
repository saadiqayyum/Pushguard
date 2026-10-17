import { installationById, seenDeliveries } from "@/lib/db"
import { planRedeliveries } from "@/lib/delivery-plan"
import { listAppDeliveries, redeliver } from "@/lib/github"
import { logger } from "@/lib/logger"
import { metaAlert } from "@/lib/meta-alerts"
import { MAX_DELIVERY_ATTEMPTS, RECONCILE_LOOKBACK_MS } from "./limits"

export async function reconcileDeliveries(): Promise<void> {
  const log = await listAppDeliveries(new Date(Date.now() - RECONCILE_LOOKBACK_MS))
  const plan = planRedeliveries(log, await seenDeliveries([...new Set(log.map((d) => d.guid))]))

  for (const delivery of plan.redeliver) {
    if (!(await redeliver(delivery.id))) plan.abandoned.push(delivery)
  }
  for (const delivery of plan.abandoned) {
    const installation = delivery.installationId ? await installationById(delivery.installationId) : null
    if (!installation) continue
    await metaAlert("delivery_missed", installation.org, [
      `A ${delivery.event} webhook from ${delivery.deliveredAt.toISOString()} never reached Pushguard after ${MAX_DELIVERY_ATTEMPTS} attempts. What it carried was not evaluated.`,
    ])
  }
  logger.info("deliveries_reconciled", { read: log.length, redelivered: plan.redeliver.length, abandoned: plan.abandoned.length })
}
