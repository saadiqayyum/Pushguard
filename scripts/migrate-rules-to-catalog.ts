import { db } from "@/lib/db"
/**
 * Move an account off seeded rule copies and onto the catalog.
 *
 * Rules used to be copied into the database for every account at install. The
 * catalog replaced that, and those copies are now indistinguishable from
 * deliberate overrides: they would shadow the shipped rule forever, so an
 * improvement to a rule would never reach anybody who installed before today.
 *
 * Three ids moved into ecosystem packs at the same time, so a seeded copy has
 * to be matched to its new name before it can be recognised as a duplicate.
 *
 * Reports by default and changes nothing. Pass --apply to delete *only* the
 * copies that are byte-identical to their catalog entry, which are safe by
 * definition. Anything that differs is kept and printed field by field, because
 * this cannot tell a deliberate edit from a copy of an older catalog, and
 * reverting one is a click in the dashboard.
 *
 *   npm run migrate:catalog          # what would happen
 *   npm run migrate:catalog -- --apply
 */
import { catalogById } from "../lib/rules/catalog"
import { ruleSchema, type Rule } from "../schemas/rule"

/** Seeded id -> catalog id, for the rules that moved into a pack. */
const RENAMED: Record<string, string> = {
  "install-hook-added": "js-install-hook-added",
  "obfuscated-payload": "js-obfuscated-payload",
  "workflow-changed": "ci-workflow-changed",
}

/**
 * Which fields differ, so a human can tell the two cases apart.
 *
 * This script cannot. A stored rule that no longer matches the catalog is
 * either something somebody deliberately changed or an untouched copy of an
 * older catalog that has since been improved, and nothing in the database
 * separates them: `rule_versions` shows `created, updated` for every seeded
 * rule, because an earlier migration rewrote them all. So it prints the
 * difference and stops. Deleting somebody's detection rules on a guess is not
 * a trade worth making, and reverting one is a click in the dashboard.
 */
function fieldsThatDiffer(stored: Rule, shipped: Rule): string[] {
  const keys = new Set([...Object.keys(stored), ...Object.keys(shipped)])
  keys.delete("id")
  keys.delete("pack")
  return [...keys]
    .filter(
      (key) =>
        JSON.stringify(stored[key as keyof Rule]) !== JSON.stringify(shipped[key as keyof Rule]),
    )
    .sort()
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply")
  const docs = await db.rules().find({}).toArray()

  const redundant: { _id: string; owner: string; ruleId: string; as: string }[] = []
  const kept: { owner: string; ruleId: string; why: string; detail?: string[] }[] = []

  for (const doc of docs) {
    const catalogId = RENAMED[doc.ruleId] ?? doc.ruleId
    const shipped = catalogById.get(catalogId)
    if (!shipped) {
      kept.push({ owner: doc.owner, ruleId: doc.ruleId, why: "not in the catalog; written here" })
      continue
    }

    const parsed = ruleSchema.safeParse(doc.body)
    if (!parsed.success) {
      kept.push({ owner: doc.owner, ruleId: doc.ruleId, why: "does not parse; left alone" })
      continue
    }
    if (doc.enabled !== shipped.enabled) {
      kept.push({ owner: doc.owner, ruleId: doc.ruleId, why: `enabled=${doc.enabled}, catalog says ${shipped.enabled}` })
      continue
    }
    const differing = fieldsThatDiffer(parsed.data, shipped)
    if (differing.length > 0) {
      kept.push({
        owner: doc.owner,
        ruleId: doc.ruleId,
        why: `differs from the catalog in: ${differing.join(", ")}`,
        detail: differing.map(
          (key) =>
            `  ${key}\n    stored:  ${JSON.stringify(parsed.data[key as keyof Rule])}\n    catalog: ${JSON.stringify(shipped[key as keyof Rule])}`,
        ),
      })
      continue
    }
    redundant.push({ _id: doc._id, owner: doc.owner, ruleId: doc.ruleId, as: catalogId })
  }

  for (const row of kept) {
    console.log(`KEEP   ${row.owner}/${row.ruleId}: ${row.why}`)
    for (const line of row.detail ?? []) console.log(line)
  }
  for (const row of redundant) {
    const renamed = row.ruleId === row.as ? "" : ` (now ${row.as})`
    console.log(`${apply ? "DELETE" : "WOULD "} ${row.owner}/${row.ruleId}${renamed}: identical to the catalog`)
  }

  if (apply && redundant.length > 0) {
    const result = await db.rules().deleteMany({ _id: { $in: redundant.map((row) => row._id) } })
    console.log(`\nDeleted ${result.deletedCount} redundant copies.`)
  }
  console.log(
    `\n${docs.length} stored rule${docs.length === 1 ? "" : "s"}: ` +
      `${redundant.length} redundant, ${kept.length} kept.` +
      (apply || redundant.length === 0 ? "" : "\nNothing changed. Re-run with --apply."),
  )
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
