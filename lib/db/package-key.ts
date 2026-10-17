import { and, eq, inArray, or, type SQL } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"

export type PackageKey = { ecosystem: string; name: string }

// One IN list per ecosystem, so the (ecosystem, name) index serves the lookup.
export function packageKeyFilter(ecosystem: PgColumn, name: PgColumn, keys: PackageKey[]): SQL | undefined {
  return or(
    ...[...Map.groupBy(keys, (k) => k.ecosystem)].map(([value, group]) =>
      and(eq(ecosystem, value), inArray(name, group.map((k) => k.name))),
    ),
  )
}
