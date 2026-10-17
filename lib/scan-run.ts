import {
  MAX_SCAN_FINDINGS,
  claimScan,
  installationById,
  noteRepo,
  repoRecord,
  updateScan,
  type InstallationDoc,
  type ScanDoc,
  type ScanFinding,
  type ScanRepo,
} from "@/lib/db"
import { catalogRules } from "@/lib/rules/catalog"
import { confirmContentMatches, evaluateRules, scannableRules, type PushContext } from "@/lib/engine"
import { SEVERITY_ORDER, toFinding } from "@/lib/finding"
import { AppError, type ErrorCode } from "@/lib/errors"
import { fetchRepoSnapshot } from "@/lib/github"
import { logger } from "@/lib/logger"
import { getActiveRules } from "@/lib/rules"
import { getActiveAiRules, runAiRules } from "@/lib/ai-rules"
import { enqueueReviewSession, sessionRule } from "@/lib/review-session"
import type { Rule } from "@/schemas/rule"

async function rulesForScan(installation: InstallationDoc | null): Promise<Rule[]> {
  const owned = installation ? await getActiveRules(installation.org) : []
  return scannableRules(owned.length > 0 ? owned : catalogRules)
}

// Runs as the scan job. A failure is recorded on the scan, not retried: the
// user sees it and can start another.
export async function runScan(id: string): Promise<void> {
  const scan = await claimScan(id)
  if (!scan) return

  try {
    const { findings, scanned } = await collectFindings(scan)
    await updateScan(id, { status: "done", findings, scanned, finishedAt: new Date(), active: null })
    logger.info("scan_completed", {
      id,
      target: scan.target,
      repos: scanned.length,
      findings: findings.length,
    })
  } catch (error) {
    const message = error instanceof AppError ? error.message : "Scan failed"
    const errorCode: ErrorCode = error instanceof AppError ? error.code : "internal"
    await updateScan(id, { status: "failed", error: message, errorCode, finishedAt: new Date(), active: null })
    logger.error("scan_failed", {
      id,
      target: scan.target,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

// Reads with the installation token. `changed`-scope AI rules run on the files the
// window touched with no push context; `repository` rules are queued after.
async function collectFindings(
  scan: ScanDoc,
): Promise<{ findings: ScanFinding[]; scanned: ScanRepo[] }> {
  const installation = await installationById(scan.installationId)
  const rules = await rulesForScan(installation)
  const hourUtc = new Date().getUTCHours()
  const failures: ErrorCode[] = []
  const scanned: ScanRepo[] = []

  const results = await Promise.all(
    scan.repos.map(async (repo) => {
      try {
        const known = scan.branch ? undefined : (await repoRecord(repo))?.defaultBranch
        const snapshot = await fetchRepoSnapshot(repo, scan.installationId, scan.branch ?? known)
        const context: PushContext = {
          repo: snapshot.repo,
          branch: snapshot.branch,
          forced: false,
          senderFirstPush: false,
          branchCreated: false,
          branchDeleted: false,
          authorMismatch: false,
          unreviewed: null,
          hourUtc,
          files: snapshot.files,
          commitMessages: [],
        }
        if (!scan.branch) await noteRepo(snapshot.repo, { defaultBranch: snapshot.branch })

        scanned.push({
          repo: snapshot.repo,
          branch: snapshot.branch,
          commits: snapshot.commits,
          headSha: snapshot.headSha,
          baseSha: snapshot.baseSha,
          truncated: snapshot.truncated,
        })

        const confirmed = confirmContentMatches(evaluateRules(rules, context), snapshot.addedLines)
        const findings = confirmed.map((match) =>
          toFinding(match.rule, snapshot.repo, match.matchedFiles, match.matchedLines),
        )

        if (scan.aiKey && installation && snapshot.headSha) {
          findings.push(
            ...(await runAiRules(
              installation,
              snapshot.repo,
              snapshot.branch,
              snapshot.headSha,
              snapshot.files,
              undefined,
              scan.aiKey,
            )),
          )
        }
        return findings
      } catch (error) {
        logger.warn("scan_repo_failed", {
          id: scan.id,
          repo,
          error: error instanceof Error ? error.message : String(error),
        })
        failures.push(error instanceof AppError ? error.code : "internal")
        return null
      }
    }),
  )

  if (results.every((result) => result === null)) {
    const removed = failures.length > 0 && failures.every((code) => code === "not_found")
    if (removed && scan.branch) {
      throw new AppError("not_found", `No branch named ${scan.branch} in ${scan.target}.`)
    }
    if (removed) throw new AppError("install_required", `Pushguard no longer has access to ${scan.target}.`)
    throw new AppError(failures[0] ?? "upstream_github", `Could not read ${scan.target}.`)
  }

  const findings = results
    .flatMap((result) => result ?? [])
    .sort((a, b) => SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity))
    .slice(0, MAX_SCAN_FINDINGS)

  if (scan.aiKey && installation) await queueRepositoryReviews(scan, installation, scanned, findings)

  return { findings, scanned: scanned.sort((a, b) => a.repo.localeCompare(b.repo)) }
}

// Repository-scope rules navigate the tree and cannot finish in this job. Each is
// seeded with the files this scan flagged, the cheapest strong prior for an agent.
async function queueRepositoryReviews(
  scan: ScanDoc,
  installation: InstallationDoc,
  scanned: ScanRepo[],
  findings: ScanFinding[],
): Promise<void> {
  const repositoryRules = (await getActiveAiRules(installation.org)).filter(
    (rule) => rule.scope === "repository",
  )
  for (const read of scanned) {
    if (repositoryRules.length === 0 || !read.headSha) break
    const seeds = [
      ...new Set(
        findings
          .filter((finding) => finding.repo === read.repo)
          .flatMap((finding) => finding.files),
      ),
    ]
    await enqueueReviewSession({
      org: installation.org,
      installationId: scan.installationId,
      repo: read.repo,
      branch: read.branch,
      sha: read.headSha,
      source: "scan",
      ...(read.baseSha ? { baseSha: read.baseSha } : {}),
      rules: repositoryRules.map((rule) => sessionRule(rule, scan.aiKey ?? undefined)),
      seeds,
    })
  }
}
