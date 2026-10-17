import { sql } from "drizzle-orm"
import { text, timestamp } from "drizzle-orm/pg-core"
import { app, q, systemAccess } from "./client"

// Publicly attributed supply-chain actors, seeded from data/threat-intel. Global
// and read only by jobs, so system-only.
export const threatActors = app
  .table(
    "threat_actors",
    {
      id: text().primaryKey(),
      name: text().notNull(),
      aliases: text().array().notNull().default(sql`'{}'`),
      mitreId: text(),
      summary: text().notNull(),
      references: text().array().notNull().default(sql`'{}'`),
      updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    () => [systemAccess("threat_actors")],
  )
  .enableRLS()

export type ThreatActor = typeof threatActors.$inferSelect

export async function upsertThreatActors(rows: Omit<ThreatActor, "updatedAt">[]): Promise<void> {
  if (rows.length === 0) return
  await q((tx) =>
    tx
      .insert(threatActors)
      .values(rows)
      .onConflictDoUpdate({
        target: threatActors.id,
        set: {
          name: sql`excluded.name`,
          aliases: sql`excluded.aliases`,
          mitreId: sql`excluded.mitre_id`,
          summary: sql`excluded.summary`,
          references: sql`excluded.references`,
          updatedAt: new Date(),
        },
      }),
  )
}
