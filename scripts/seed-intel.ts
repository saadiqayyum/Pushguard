import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { asSystem, enqueueJobs, upsertThreatActors, upsertThreatIndicators } from "@/lib/db"
import { osvEcosystem } from "@/lib/ecosystems"
import type { JobMessage } from "@/schemas/job"
import { packageIndicator, threatIntelSeed, type ThreatIntelSeed } from "@/schemas/threat-intel"

const DIR = "data/threat-intel"

// Package indicators go through the same job as an advisory, so seeding a
// package also alerts every repository that already depends on it.
function packageJobs(seed: ThreatIntelSeed): JobMessage[] {
  const groups = new Map<string, Extract<JobMessage, { type: "malicious_packages" }>>()
  for (const indicator of seed.indicators.filter((i) => i.kind === "package")) {
    const pkg = packageIndicator.parse(indicator.value)
    const ecosystem = osvEcosystem(pkg.ecosystem)
    if (!ecosystem) throw new Error(`Unknown ecosystem in ${indicator.value}`)
    const advisoryId = `intel:${indicator.actorId ?? indicator.campaign}`
    const job = groups.get(advisoryId) ?? {
      type: "malicious_packages" as const,
      source: "intel" as const,
      advisoryId,
      summary: indicator.campaign,
      publishedAt: indicator.firstSeen ? `${indicator.firstSeen}T00:00:00Z` : null,
      withdrawnAt: null,
      packages: [],
    }
    const existing = job.packages.find((p) => p.ecosystem === ecosystem && p.name === pkg.name)
    if (existing) existing.versions.push(pkg.version)
    else job.packages.push({ ecosystem, name: pkg.name, versionRange: null, versions: [pkg.version] })
    groups.set(advisoryId, job)
  }
  return [...groups.values()]
}

async function main(): Promise<void> {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json"))
  for (const file of files) {
    const seed = threatIntelSeed.parse(JSON.parse(readFileSync(join(DIR, file), "utf8")))
    const jobs = packageJobs(seed)
    await asSystem(async () => {
      await upsertThreatActors(seed.actors)
      await upsertThreatIndicators(seed.indicators)
      await enqueueJobs(jobs)
    })
    process.stdout.write(`${file}: ${seed.actors.length} actors, ${seed.indicators.length} indicators, ${jobs.length} package jobs\n`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    process.stderr.write(`intel seed failed: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  })
