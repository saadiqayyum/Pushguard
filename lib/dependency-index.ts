import {
  inventoriedManifests,
  maliciousEntriesFor,
  MAX_LOCKFILE_BYTES,
  MAX_MANIFESTS_PER_RUN,
  removeManifests,
  replaceManifest,
  type InventoryRow,
} from "@/lib/db"
import { matchDependents } from "@/lib/dependent-match"
import { fetchRawFile, type TreeEntry } from "@/lib/github"
import { isLockfile, parseLockfile } from "@/lib/lockfiles"
import { logger } from "@/lib/logger"
import { alertDependents } from "@/lib/malicious-dependents"

// Keeps dependency_inventory in step with the lockfiles in the tree the index
// job already read. On install, what is already known to be malicious is alerted.
export async function inventoryDependencies(
  job: { repo: string; installationId: number; ref: string; removed?: string[]; checkExisting: boolean },
  tree: TreeEntry[],
  wanted: Set<string> | null,
): Promise<{ complete: boolean }> {
  const { repo } = job
  const lockfiles = tree.filter((entry) => (!wanted || wanted.has(entry.path)) && isLockfile(entry.path))
  const known = await inventoriedManifests(repo)
  const present = new Set(tree.map((entry) => entry.path))
  const gone = [...known.keys()].filter((path) => (!wanted && !present.has(path)) || job.removed?.includes(path))
  await removeManifests(repo, gone)

  const stale = lockfiles.filter((entry) => known.get(entry.path) !== entry.blobSha)
  const inventoried: InventoryRow[] = []
  for (const entry of stale.slice(0, MAX_MANIFESTS_PER_RUN)) {
    if (entry.size > MAX_LOCKFILE_BYTES) {
      logger.warn("lockfile_not_inventoried", { repo, path: entry.path, reason: "too_large", size: entry.size })
      continue
    }
    const text = await fetchRawFile(job.installationId, repo, job.ref, entry.path)
    let parsed: ReturnType<typeof parseLockfile>
    try {
      parsed = parseLockfile(entry.path, text)
    } catch (error) {
      logger.warn("lockfile_not_inventoried", { repo, path: entry.path, reason: "unparseable", error: String(error) })
      continue
    }
    if (parsed.truncated) logger.warn("lockfile_partly_inventoried", { repo, path: entry.path, kept: parsed.entries.length })
    await replaceManifest(repo, entry.path, { blobSha: entry.blobSha, indexedSha: job.ref }, parsed.entries)
    if (job.checkExisting) inventoried.push(...parsed.entries.map((e) => ({ ...e, repo, manifestPath: entry.path })))
  }

  if (inventoried.length > 0) {
    await alertDependents(matchDependents(inventoried, await maliciousEntriesFor(inventoried)))
  }
  logger.info("dependency_inventory_ran", { repo, lockfiles: lockfiles.length, stale: stale.length, removed: gone.length })
  return { complete: stale.length <= MAX_MANIFESTS_PER_RUN }
}
