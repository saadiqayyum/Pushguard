import type { AppDelivery } from "@/lib/github"
import { MAX_DELIVERY_ATTEMPTS, MAX_REDELIVERIES_PER_RUN } from "@/lib/jobs/limits"

export type DeliveryPlan = { redeliver: AppDelivery[]; abandoned: AppDelivery[] }

// Per delivery guid: anything that succeeded once, or that we recorded, is
// done. A failure gets redelivered until it has used its attempts.
export function planRedeliveries(log: AppDelivery[], seen: Set<string>): DeliveryPlan {
  const byGuid = new Map<string, AppDelivery[]>()
  for (const attempt of log) byGuid.set(attempt.guid, [...(byGuid.get(attempt.guid) ?? []), attempt])

  const plan: DeliveryPlan = { redeliver: [], abandoned: [] }
  for (const [guid, attempts] of byGuid) {
    if (seen.has(guid) || attempts.some((a) => a.statusCode >= 200 && a.statusCode < 300)) continue
    const latest = attempts.reduce((a, b) => (a.deliveredAt > b.deliveredAt ? a : b))
    if (attempts.length >= MAX_DELIVERY_ATTEMPTS) plan.abandoned.push(latest)
    else plan.redeliver.push(latest)
  }
  plan.redeliver = plan.redeliver.slice(0, MAX_REDELIVERIES_PER_RUN)
  return plan
}
