import { eq, inArray } from "drizzle-orm"
import { text, timestamp } from "drizzle-orm/pg-core"
import { app, q, systemAccess } from "./client"

// Every webhook delivery seen, so a redelivery is recognised and not processed twice.
export const deliveries = app
  .table(
    "deliveries",
    {
      id: text().primaryKey(),
      event: text().notNull(),
      receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    () => [systemAccess("deliveries")],
  )
  .enableRLS()

// True only for the first caller with this id.
export async function claimDelivery(id: string, event: string): Promise<boolean> {
  const rows = await q((tx) =>
    tx.insert(deliveries).values({ id, event }).onConflictDoNothing().returning({ id: deliveries.id }),
  )
  return rows.length > 0
}

// A delivery whose handling failed is forgotten, so a manual redelivery is not deduplicated away.
export async function releaseDelivery(id: string): Promise<void> {
  await q((tx) => tx.delete(deliveries).where(eq(deliveries.id, id)))
}

export async function seenDeliveries(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await q((tx) => tx.select({ id: deliveries.id }).from(deliveries).where(inArray(deliveries.id, ids)))
  return new Set(rows.map((row) => row.id))
}
