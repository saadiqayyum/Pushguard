import { eq, ne, sql } from "drizzle-orm"
import { date, index, text, unique, uuid } from "drizzle-orm/pg-core"
import type { IndicatorKind } from "@/schemas/threat-intel"
import { app, q, systemAccess } from "./client"
import { MAX_INDICATORS_LOADED } from "./limits"
import { threatActors } from "./threat-actors"


// Identifiers from public reports, each with the report that names it. Never
// samples or payloads.
export const threatIndicators = app
  .table(
    "threat_indicators",
    {
      id: uuid().primaryKey().defaultRandom(),
      actorId: text().references(() => threatActors.id, { onDelete: "set null" }),
      campaign: text().notNull(),
      kind: text().$type<IndicatorKind>().notNull(),
      value: text().notNull(),
      firstSeen: date(),
      references: text().array().notNull().default(sql`'{}'`),
    },
    (t) => [systemAccess("threat_indicators"), unique().on(t.kind, t.value, t.campaign), index().on(t.actorId)],
  )
  .enableRLS()

export type ThreatIndicator = typeof threatIndicators.$inferSelect & { actorName: string | null }

export async function upsertThreatIndicators(rows: Omit<typeof threatIndicators.$inferInsert, "id">[]): Promise<void> {
  if (rows.length === 0) return
  await q((tx) =>
    tx
      .insert(threatIndicators)
      .values(rows)
      .onConflictDoUpdate({
        target: [threatIndicators.kind, threatIndicators.value, threatIndicators.campaign],
        set: { actorId: sql`excluded.actor_id`, firstSeen: sql`excluded.first_seen`, references: sql`excluded.references` },
      }),
  )
}

// Package indicators are matched as dependencies, through malicious_packages.
export async function loadIndicators(): Promise<ThreatIndicator[]> {
  return q((tx) =>
    tx
      .select({
        id: threatIndicators.id,
        actorId: threatIndicators.actorId,
        campaign: threatIndicators.campaign,
        kind: threatIndicators.kind,
        value: threatIndicators.value,
        firstSeen: threatIndicators.firstSeen,
        references: threatIndicators.references,
        actorName: threatActors.name,
      })
      .from(threatIndicators)
      .leftJoin(threatActors, eq(threatActors.id, threatIndicators.actorId))
      .where(ne(threatIndicators.kind, "package"))
      .limit(MAX_INDICATORS_LOADED),
  )
}
