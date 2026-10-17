import { dependentsOf, maliciousEntriesFor, upsertMaliciousPackages, type NewMaliciousPackage } from "@/lib/db"
import { matchDependents } from "@/lib/dependent-match"
import { packageName } from "@/lib/ecosystems"
import { logger } from "@/lib/logger"
import { alertDependents } from "@/lib/malicious-dependents"
import type { JobMessage } from "@/schemas/job"

type MaliciousPackagesJob = Extract<JobMessage, { type: "malicious_packages" }>

// Alerts before recording, so a job that fails mid-way is retried with the same
// packages still new. Withdrawals and updates to known entries file nothing.
export async function ingestMaliciousPackages(job: MaliciousPackagesJob): Promise<void> {
  const rows: NewMaliciousPackage[] = job.packages.map((pkg) => ({
    ecosystem: pkg.ecosystem,
    name: packageName(pkg.ecosystem, pkg.name),
    versionRange: pkg.versionRange,
    versions: pkg.versions,
    source: job.source,
    advisoryId: job.advisoryId,
    summary: job.summary,
    publishedAt: job.publishedAt ? new Date(job.publishedAt) : null,
    withdrawnAt: job.withdrawnAt ? new Date(job.withdrawnAt) : null,
  }))
  const known = new Set(
    (await maliciousEntriesFor(rows))
      .filter((entry) => entry.source === job.source && entry.advisoryId === job.advisoryId)
      .map((entry) => `${entry.ecosystem}\0${entry.name}`),
  )
  const fresh = job.withdrawnAt
    ? []
    : rows
        .filter((row) => !known.has(`${row.ecosystem}\0${row.name}`))
        .map((row) => ({ ...row, versionRange: row.versionRange ?? null, versions: row.versions ?? [], withdrawnAt: null }))
  if (fresh.length > 0) await alertDependents(matchDependents(await dependentsOf(fresh), fresh))
  await upsertMaliciousPackages(rows)
  logger.info("malicious_packages_ingested", { advisory: job.advisoryId, source: job.source, packages: rows.length, fresh: fresh.length })
}
