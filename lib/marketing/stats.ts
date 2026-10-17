import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import seed from "@/data/threat-intel/seed.json"
import pkg from "@/package.json"
import { catalogRules, PACKS } from "@/lib/rules/catalog"
import { CATEGORIES, type CategoryId } from "./categories"
import { statusCounts } from "./counts"
import { parseAttackDoc, parseIncidents, parseSurfaces, type AttackDoc } from "./parse"

export type Attack = AttackDoc & { category: CategoryId; slug: string; url: string }

const DOCS = join(process.cwd(), "docs")
const read = (...parts: string[]) => readFileSync(join(DOCS, ...parts), "utf8")

function loadAttacks(): Attack[] {
  return CATEGORIES.flatMap(({ id }) =>
    readdirSync(join(DOCS, "attacks", id))
      .filter((file) => file.endsWith(".md"))
      .sort()
      .map((file) => {
        const slug = file.slice(0, -3)
        return { ...parseAttackDoc(read("attacks", id, file)), category: id, slug, url: `/research/${id}/${slug}` }
      }),
  )
}

function compute() {
  const attacks = loadAttacks()
  const incidents = parseIncidents(read("THREAT_CATALOG.md"))
  const years = incidents.flatMap((i) => i.years)
  const surfaces = parseSurfaces(read("EXECUTION_SURFACES.md"))
  return {
    attacks,
    byCategory: CATEGORIES.map((c) => ({ ...c, count: attacks.filter((a) => a.category === c.id).length })),
    byStatus: statusCounts(attacks),
    incidents: { count: incidents.length, from: Math.min(...years), to: Math.max(...years) },
    rules: catalogRules.length,
    packs: PACKS.length,
    actors: seed.actors.length,
    indicators: seed.indicators.length,
    surfaces,
    surfaceCount: surfaces.reduce((n, f) => n + f.count, 0),
    grammars: Object.keys(pkg.dependencies).filter((name) => name.startsWith("tree-sitter-")).length,
  }
}

export type MarketingStats = ReturnType<typeof compute>

let cached: MarketingStats | undefined

// The docs ship with the build, so one read per server process is the truth until the next deploy.
export function marketingStats(): MarketingStats {
  cached ??= compute()
  return cached
}
