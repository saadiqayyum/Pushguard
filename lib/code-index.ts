import { indexFiles } from "@/lib/code-intel/write";
import { filesMentioning, indexedBlobs } from "@/lib/db";
import { inventoryDependencies } from "@/lib/dependency-index";
import { BLOB_BATCH, fetchBlobs, fetchRepoTree } from "@/lib/github";
import { logger } from "@/lib/logger";
import { normalizeSymbol } from "@/lib/tokens";
import { INTEL_FILE, SOURCE_FILE } from "@/lib/source-files";

// The searchable index of a repository.

// Above this a file is generated or vendored, and its names are not anybody's API.
export const MAX_INDEXED_BYTES = 500_000;

// Stop with budget to spare rather than being refused.
const RATE_FLOOR = 1_000;

// One invocation's share of a large repository.
const MAX_BATCHES_PER_RUN = 12;

// Make sure a repository is indexed before something reads the index.
export async function ensureIndexed(
  repo: string,
  installationId: number,
  ref: string,
): Promise<{ indexed: number; complete: boolean }> {
  try {
    return await indexRepo({ repo, installationId, ref });
  } catch (error) {
    logger.warn("ensure_indexed_failed", { repo, error: String(error) });
    return { indexed: 0, complete: false };
  }
}

// Which files mention a name. The whole point of the index.
export async function findReferences(
  repo: string,
  symbol: string,
  limit = 50,
): Promise<string[]> {
  const token = normalizeSymbol(symbol);
  if (token.length < 3) return [];
  return filesMentioning(repo, token, limit);
}

// Index one repository, or the part of it a push changed. Idempotent: an
// unchanged blob is never re-read, so an unfinished run is resumed by rerunning it.
export async function indexRepo(job: {
  repo: string;
  installationId: number;
  ref: string;
  paths?: string[];
  removed?: string[];
  reason?: "install" | "push";
}): Promise<{ indexed: number; complete: boolean; rateLimited: boolean }> {
  const { repo, installationId, ref } = job;

  const tree = await fetchRepoTree(installationId, repo, ref);
  const truncated = tree.truncated;
  const wanted = job.paths ? new Set(job.paths) : null;

  const candidates = tree.entries
    .filter((entry) => !wanted || wanted.has(entry.path))
    .filter(
      (entry) =>
        (SOURCE_FILE.test(entry.path) || INTEL_FILE.test(entry.path)) &&
        entry.size > 0 &&
        entry.size <= MAX_INDEXED_BYTES,
    );

  const inventory = await inventoryDependencies(
    { ...job, checkExisting: job.reason === "install" },
    tree.entries,
    wanted,
  );

  const known = await indexedBlobs(repo);
  const stale = candidates.filter(
    (entry) => known.get(entry.path) !== entry.blobSha,
  );

  let indexed = 0;
  let complete = inventory.complete;
  let rateLimited = false;
  for (let start = 0; start < stale.length; start += BLOB_BATCH) {
    if (start / BLOB_BATCH >= MAX_BATCHES_PER_RUN) {
      complete = false;
      break;
    }
    const slice = stale.slice(start, start + BLOB_BATCH);
    const { files, remaining } = await fetchBlobs(
      installationId,
      repo,
      ref,
      slice.map((entry) => entry.path),
    );

    await indexFiles(
      repo,
      slice.filter((entry) => files.has(entry.path)).map((entry) => ({ ...entry, text: files.get(entry.path)! })),
      () => ({ commit: ref, author: null }),
      { baseline: true },
    );
    indexed += files.size;

    if (remaining !== null && remaining < RATE_FLOOR) {
      logger.warn("index_paused_low_rate_budget", { repo, remaining });
      complete = false;
      rateLimited = true;
      break;
    }
  }

  if (job.removed?.length) await indexFiles(repo, [], () => ({ commit: ref, author: null }), { baseline: true, removed: job.removed });

  logger.info("index_job_ran", {
    repo,
    indexed,
    stale: stale.length,
    complete,
    truncated,
  });
  return { indexed, complete, rateLimited };
}
