import { and, eq, inArray, sql } from "drizzle-orm"
import { index, pgPolicy, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import { app, appRole, q, systemAccess } from "./client"
import { MAX_DEPENDENTS_READ } from "./limits"
import { packageKeyFilter, type PackageKey } from "./package-key"

// What each repository's lockfiles resolve to, so a package flagged later can
// be traced to every repository that already depends on it.
export const dependencyInventory = app
  .table(
    "dependency_inventory",
    {
      repo: text().notNull(),
      manifestPath: text().notNull(),
      ecosystem: text().notNull(),
      name: text().notNull(),
      version: text().notNull(),
      blobSha: text().notNull(),
      indexedSha: text().notNull(),
      updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
      systemAccess("dependency_inventory"),
      primaryKey({ columns: [t.repo, t.manifestPath, t.ecosystem, t.name, t.version] }),
      index().on(t.ecosystem, t.name),
      pgPolicy("dependency_inventory_readable", { for: "select", to: appRole, using: sql`authz.can_read(repo)` }),
    ],
  )
  .enableRLS()

export type InventoryRow = Pick<typeof dependencyInventory.$inferSelect, "repo" | "manifestPath" | "ecosystem" | "name" | "version">

// Which blob each manifest was last read from, so an unchanged lockfile is not re-read.
export async function inventoriedManifests(repo: string): Promise<Map<string, string>> {
  const rows = await q((tx) =>
    tx
      .selectDistinct({ path: dependencyInventory.manifestPath, blobSha: dependencyInventory.blobSha })
      .from(dependencyInventory)
      .where(eq(dependencyInventory.repo, repo)),
  )
  return new Map(rows.map((row) => [row.path, row.blobSha]))
}

export async function replaceManifest(
  repo: string,
  manifestPath: string,
  shas: { blobSha: string; indexedSha: string },
  entries: (PackageKey & { version: string })[],
): Promise<void> {
  await q(async (tx) => {
    await tx
      .delete(dependencyInventory)
      .where(and(eq(dependencyInventory.repo, repo), eq(dependencyInventory.manifestPath, manifestPath)))
    if (entries.length > 0) {
      await tx
        .insert(dependencyInventory)
        .values(entries.map((entry) => ({ repo, manifestPath, ...shas, ...entry })))
        .onConflictDoNothing()
    }
  })
}

export async function removeManifests(repo: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return
  await q((tx) =>
    tx
      .delete(dependencyInventory)
      .where(and(eq(dependencyInventory.repo, repo), inArray(dependencyInventory.manifestPath, paths))),
  )
}

export async function dependentsOf(keys: PackageKey[]): Promise<InventoryRow[]> {
  if (keys.length === 0) return []
  return q((tx) =>
    tx
      .select({
        repo: dependencyInventory.repo,
        manifestPath: dependencyInventory.manifestPath,
        ecosystem: dependencyInventory.ecosystem,
        name: dependencyInventory.name,
        version: dependencyInventory.version,
      })
      .from(dependencyInventory)
      .where(packageKeyFilter(dependencyInventory.ecosystem, dependencyInventory.name, keys))
      .limit(MAX_DEPENDENTS_READ),
  )
}
