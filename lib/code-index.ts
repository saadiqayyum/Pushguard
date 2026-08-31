import {
  db,
  dropIndex,
  filesMentioning,
  indexedBlobs,
  writeIndex,
} from "@/lib/db";
import { BLOB_BATCH, fetchBlobs, fetchRepoTree } from "@/lib/github";
import { logger } from "@/lib/logger";
import { normalizeSymbol, tokenize } from "@/lib/tokens";
import { SOURCE_FILE } from "@/lib/source-files";

// The searchable index of a repository.

// Above this a file is generated or vendored, and its names are not anybody's API.
const MAX_INDEXED_BYTES = 500_000;

// Stop with budget to spare rather than being refused.
const RATE_FLOOR = 1_000;

// One invocation's share of a large repository.
const MAX_BATCHES_PER_RUN = 12;

// Queue a repository for indexing, replacing whatever was already pending.
export async function enqueueIndex(input: {
  repo: string;
  installationId: number;
  ref: string;
  reason: "install" | "push";
  paths?: string[];
  removed?: string[];
}): Promise<void> {
  const jobs = db.indexJobs();
  const seed = {
    _id: crypto.randomUUID(),
    repo: input.repo,
    status: "queued" as const,
    attempts: 0,
    createdAt: new Date(),
  };

  try {
    if (input.reason === "install") {
      await jobs.updateOne(
        { repo: input.repo, status: "queued" },
        {
          $set: {
            installationId: input.installationId,
            ref: input.ref,
            reason: "install" as const,
          },
          $unset: { paths: "", removed: "" },
          $setOnInsert: seed,
        },
        { upsert: true },
      );
      return;
    }

    const pending = await jobs.findOne({ repo: input.repo, status: "queued" });
    if (pending?.reason === "install") {
      await jobs.updateOne({ _id: pending._id }, { $set: { ref: input.ref } });
      return;
    }

    await jobs.updateOne(
      { repo: input.repo, status: "queued" },
      {
        $set: {
          installationId: input.installationId,
          ref: input.ref,
          reason: "push" as const,
        },
        $addToSet: {
          paths: { $each: input.paths ?? [] },
          removed: { $each: input.removed ?? [] },
        },
        $setOnInsert: seed,
      },
      { upsert: true },
    );
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
  }
}

// Forget a repository the app can no longer see.
export async function forgetIndex(repos: string[]): Promise<void> {
  await dropIndex(repos);
  if (repos.length > 0) {
    await db.indexJobs().deleteMany({ repo: { $in: repos }, status: "queued" });
  }
}

// Make sure a repository is indexed before something reads the index.
export async function ensureIndexed(
  repo: string,
  installationId: number,
  ref: string,
): Promise<{ indexed: number; complete: boolean }> {
  try {
    return await runJob({ _id: "inline", repo, installationId, ref });
  } catch (error) {
    logger.warn("ensure_indexed_failed", { repo, error: String(error) });
    return { indexed: 0, complete: false };
  }
}

// How much of a repository the index actually covers, for callers that report it.
export async function indexedFileCount(repo: string): Promise<number> {
  return db.codeIndex().countDocuments({ repo });
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

// Index one repository, or the part of it a push changed.
async function runJob(job: {
  _id: string;
  repo: string;
  installationId: number;
  ref: string;
  paths?: string[];
  removed?: string[];
}): Promise<{ indexed: number; complete: boolean }> {
  const { repo, installationId, ref } = job;

  const tree = await fetchRepoTree(installationId, repo, ref);
  const truncated = tree.truncated;
  const wanted = job.paths ? new Set(job.paths) : null;

  const candidates = tree.entries
    .filter((entry) => !wanted || wanted.has(entry.path))
    .filter(
      (entry) =>
        SOURCE_FILE.test(entry.path) &&
        entry.size > 0 &&
        entry.size <= MAX_INDEXED_BYTES,
    );

  const known = await indexedBlobs(repo);
  const stale = candidates.filter(
    (entry) => known.get(entry.path) !== entry.blobSha,
  );

  let indexed = 0;
  let complete = true;
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

    await writeIndex(
      repo,
      slice
        .filter((entry) => files.has(entry.path))
        .map((entry) => ({
          ...entry,
          tokens: tokenize(files.get(entry.path)!),
        })),
    );
    indexed += files.size;

    if (remaining !== null && remaining < RATE_FLOOR) {
      logger.warn("index_paused_low_rate_budget", { repo, remaining });
      complete = false;
      break;
    }
  }

  if (job.removed?.length) await writeIndex(repo, [], job.removed);

  logger.info("index_job_ran", {
    repo,
    indexed,
    stale: stale.length,
    complete,
    truncated,
  });
  return { indexed, complete };
}

// Work the queue. Mop-up only.
export async function drainIndexJobs(
  limit = 3,
  repo?: string,
): Promise<number> {
  const jobs = db.indexJobs();
  let done = 0;

  for (let i = 0; i < limit; i++) {
    const job = await jobs.findOneAndUpdate(
      { status: "queued", ...(repo ? { repo } : {}) },
      {
        $set: { status: "running", startedAt: new Date() },
        $inc: { attempts: 1 },
      },
      { sort: { createdAt: 1 }, returnDocument: "after" },
    );
    if (!job) break;

    try {
      const { complete } = await runJob(job);
      await jobs.updateOne(
        { _id: job._id },
        { $set: { status: complete ? "done" : "queued" } },
      );
      done++;
      if (!complete) break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await jobs.updateOne(
        { _id: job._id },
        {
          $set: {
            status: job.attempts >= 3 ? "failed" : "queued",
            error: message,
          },
        },
      );
      logger.warn("index_job_failed", {
        repo: job.repo,
        attempts: job.attempts,
        error: message,
      });
    }
  }
  return done;
}
