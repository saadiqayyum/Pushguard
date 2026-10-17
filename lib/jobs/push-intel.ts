import { MAX_INDEXED_BYTES } from "@/lib/code-index"
import { repoReader, type AttackPath } from "@/lib/code-intel"
import { JS_PARSEABLE } from "@/lib/code-intel/facts"
import { patchFileState } from "@/lib/code-intel/incremental"
import {
  DEFENSE_WINDOW_DAYS,
  MAX_FACTS_PER_FILE,
  MAX_INTEL_FILES_PER_PUSH,
  MAX_INTEL_ROWS,
  MAX_PATHS_PER_PUSH,
  MAX_SYMBOLS_PER_FILE,
  MAX_TRACE_DEPTH,
} from "@/lib/code-intel/limits"
import { defenseErosion, dormantActivations, erosionFindings, pathFindings } from "@/lib/code-intel/signals"
import { intelSources } from "@/lib/code-intel/sources"
import { trace } from "@/lib/code-intel/trace"
import { analyseFile, writeAnalysed, type AnalysedFile } from "@/lib/code-intel/write"
import { indexedFiles, liveFacts, symbolsInPath, type Attribution, type ScanFinding } from "@/lib/db"
import { patchLines } from "@/lib/diff-lines"
import type { ChangedFile } from "@/lib/engine"
import { AppError } from "@/lib/errors"
import { toFinding } from "@/lib/finding"
import { BLOB_BATCH, fetchBlobs } from "@/lib/github"
import { logger } from "@/lib/logger"
import type { PushDiff } from "@/lib/push-diff"
import { tokenize } from "@/lib/tokens"
import type { PushPayload } from "@/schemas/webhook"

const PARTIAL = {
  id: "code-intel-partial",
  severity: "low" as const,
  description: "Not every changed file was read for capabilities, so a multi-commit path may be missed",
}

// Who to credit for each file: the last commit in the push that touched it.
function attribution(payload: PushPayload): (path: string) => Attribution {
  const by = new Map<string, Attribution>()
  for (const commit of payload.commits) {
    const author = commit.author?.username ?? commit.author?.name ?? null
    for (const path of [...commit.added, ...commit.modified]) by.set(path, { commit: commit.id, author })
  }
  return (path) => by.get(path) ?? { commit: payload.after, author: payload.sender.login }
}

const storedSymbols = (repo: string, path: string) => symbolsInPath(repo, path, MAX_SYMBOLS_PER_FILE)

// Builds the push into the graph from the compare's patches, reading blobs only where GitHub sent none.
// Patched JavaScript keeps its old blob sha so the queued index job re-reads it for x-ray facts.
export async function codeIntelFindings(
  installationId: number,
  payload: PushPayload,
  files: ChangedFile[],
  senderFirstPush: boolean,
  diff: PushDiff | null,
): Promise<{ findings: ScanFinding[]; paths: AttackPath[] }> {
  const repo = payload.repository.full_name
  const changed = files.filter((f) => f.changeType !== "removed").map((f) => f.path)
  const removed = files.filter((f) => f.changeType === "removed").map((f) => f.path)
  if (changed.length === 0 && removed.length === 0) return { findings: [], paths: [] }
  try {
    const wanted = changed.slice(0, MAX_INTEL_FILES_PER_PUSH)
    const compared = diff ? new Map(diff.files.map((f) => [f.path, f])) : null
    const froms = diff ? diff.files.filter((f) => wanted.includes(f.path)).map((f) => f.previousPath ?? f.path) : []
    const indexed = await indexedFiles(repo, froms)
    const sources = intelSources(wanted, compared, new Set(indexed.keys()))
    const fetching = sources.fetch.slice(0, BLOB_BATCH)

    const blobs = await fetchBlobs(installationId, repo, payload.after, fetching)
    const analysed: AnalysedFile[] = []
    const before = new Map<string, Awaited<ReturnType<typeof storedSymbols>>>()
    for (const path of fetching) {
      const blobSha = blobs.oids.get(path)
      const text = blobs.files.get(path) ?? null
      if (!blobSha || (text === null && !blobs.binary.has(path)) || (text?.length ?? 0) > MAX_INDEXED_BYTES) continue
      before.set(path, await storedSymbols(repo, path))
      analysed.push(await analyseFile({ path, blobSha, text }))
    }
    for (const file of sources.whole.filter((f) => f.text.length <= MAX_INDEXED_BYTES)) {
      before.set(file.path, await storedSymbols(repo, file.path))
      analysed.push(await analyseFile({ path: file.path, blobSha: file.sha, text: file.text }))
    }
    for (const file of sources.patched) {
      const [symbols, facts] = await Promise.all([
        storedSymbols(repo, file.from),
        liveFacts(repo, { path: file.from, limit: MAX_FACTS_PER_FILE }),
      ])
      const state = await patchFileState(file.path, {
        symbols: symbols.map((s) => ({ ...s, path: file.path })),
        facts: facts.map((f) => ({ path: file.path, symbol: f.symbol, kind: f.kind, detail: f.detail, line: f.line })),
      }, file.patch)
      const prior = indexed.get(file.from)!
      before.set(file.path, symbols)
      analysed.push({
        ...state,
        path: file.path,
        blobSha: JS_PARSEABLE.test(file.path) ? prior.blobSha : file.sha,
        tokens: tokenize([...prior.tokens, ...patchLines(file.patch).added].join("\n")),
        size: prior.size,
      })
    }
    const moved = sources.patched.filter((f) => f.from !== f.path).map((f) => f.from)
    const after = await writeAnalysed(repo, analysed, attribution(payload), { baseline: false, removed: [...removed, ...moved] })

    const reader = repoReader(repo)
    const pushed = new Set([...payload.commits.map((c) => c.id), payload.after])
    const newAuthors = senderFirstPush ? new Set([payload.sender.login]) : undefined
    const paths = await trace(reader, repo, { maxDepth: MAX_TRACE_DEPTH, limit: MAX_PATHS_PER_PUSH, touching: changed, newAuthors })
    const activations = []
    for (const doc of analysed) activations.push(...(await dormantActivations(reader, repo, doc.path, before.get(doc.path) ?? [], after.get(doc.path) ?? [])))
    const recent = await liveFacts(repo, { sinceDays: DEFENSE_WINDOW_DAYS, limit: MAX_INTEL_ROWS })
    const unread = changed.length - wanted.length + (sources.fetch.length - fetching.length)
    const findings = [
      ...pathFindings(repo, paths.map((p) => p.path), pushed),
      ...activations,
      ...erosionFindings(repo, defenseErosion(recent), pushed),
      ...(unread > 0 || diff?.truncated
        ? [toFinding(PARTIAL, repo, [], [`${unread} of ${changed.length} changed files were not read for capabilities${diff?.truncated ? ", and GitHub's compare was cut short" : ""}.`], { prose: true })]
        : []),
    ]
    logger.info("code_intel_ran", {
      repo,
      patched: sources.patched.length,
      whole: sources.whole.length,
      fetched: fetching.length,
      paths: paths.length,
      findings: findings.map((f) => f.ruleId),
    })
    return { findings, paths: paths.map((p) => p.path) }
  } catch (error) {
    if (error instanceof AppError && error.code === "rate_limited") throw error
    logger.warn("code_intel_failed", { repo, error: String(error) })
    const notRun = toFinding({ ...PARTIAL, id: "code-intel-not-run" }, repo, [], ["Capability facts could not be recorded for this push, so multi-commit paths were not checked."], { prose: true })
    return { findings: [notRun], paths: [] }
  }
}
