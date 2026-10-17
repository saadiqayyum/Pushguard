import type { InventoryRow, MaliciousPackage } from "@/lib/db"
import { affects } from "@/lib/version-range"

export type DependentHit = { row: InventoryRow; entry: Pick<MaliciousPackage, "advisoryId" | "source"> }

// Which inventoried dependencies an advisory covers, grouped by repository.
export function matchDependents(
  rows: InventoryRow[],
  entries: Pick<MaliciousPackage, "ecosystem" | "name" | "versionRange" | "versions" | "withdrawnAt" | "advisoryId" | "source">[],
): Map<string, DependentHit[]> {
  const byPackage = Map.groupBy(entries, (e) => `${e.ecosystem}\0${e.name}`)
  const hits = new Map<string, DependentHit[]>()
  for (const row of rows) {
    for (const entry of byPackage.get(`${row.ecosystem}\0${row.name}`) ?? []) {
      if (!affects(entry, row.version)) continue
      hits.set(row.repo, [...(hits.get(row.repo) ?? []), { row, entry }])
      break
    }
  }
  return hits
}
