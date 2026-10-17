import { sql } from "drizzle-orm"
import { index, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"
import { app, q, systemAccess } from "./client"
import { MAX_ADVISORY_SUMMARY, MAX_MALICIOUS_ROWS_READ } from "./limits"
import { packageKeyFilter, type PackageKey } from "./package-key"

export type MaliciousSource = "ghsa" | "osv" | "intel"

// Global, not tenant data, and read only by jobs, so no app-role policy: a
// route that wants it adds one. Names are stored in their ecosystem's canonical form.
export const maliciousPackages = app
  .table(
    "malicious_packages",
    {
      id: uuid().primaryKey().defaultRandom(),
      ecosystem: text().notNull(),
      name: text().notNull(),
      versionRange: text(),
      versions: text().array().notNull().default(sql`'{}'`),
      source: text().$type<MaliciousSource>().notNull(),
      advisoryId: text().notNull(),
      summary: text().notNull().default(""),
      publishedAt: timestamp({ withTimezone: true }),
      withdrawnAt: timestamp({ withTimezone: true }),
      fetchedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
      systemAccess("malicious_packages"),
      unique().on(t.source, t.advisoryId, t.ecosystem, t.name),
      index().on(t.ecosystem, t.name),
    ],
  )
  .enableRLS()

export type MaliciousPackage = typeof maliciousPackages.$inferSelect
export type NewMaliciousPackage = Omit<typeof maliciousPackages.$inferInsert, "id" | "fetchedAt">

// Versions accumulate across sightings; everything else is the latest word.
export async function upsertMaliciousPackages(rows: NewMaliciousPackage[]): Promise<void> {
  if (rows.length === 0) return
  await q((tx) =>
    tx
      .insert(maliciousPackages)
      .values(rows.map((row) => ({ ...row, summary: row.summary?.slice(0, MAX_ADVISORY_SUMMARY) })))
      .onConflictDoUpdate({
        target: [maliciousPackages.source, maliciousPackages.advisoryId, maliciousPackages.ecosystem, maliciousPackages.name],
        set: {
          versionRange: sql`excluded.version_range`,
          versions: sql`array(select distinct unnest(${maliciousPackages.versions} || excluded.versions))`,
          summary: sql`excluded.summary`,
          publishedAt: sql`excluded.published_at`,
          withdrawnAt: sql`excluded.withdrawn_at`,
          fetchedAt: new Date(),
        },
      }),
  )
}

export async function maliciousEntriesFor(keys: PackageKey[]): Promise<MaliciousPackage[]> {
  if (keys.length === 0) return []
  return q((tx) =>
    tx
      .select()
      .from(maliciousPackages)
      .where(packageKeyFilter(maliciousPackages.ecosystem, maliciousPackages.name, keys))
      .limit(MAX_MALICIOUS_ROWS_READ),
  )
}
