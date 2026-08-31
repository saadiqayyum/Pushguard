import { resolveAlertTarget } from "@/lib/alert-target"
import { auth, githubToken } from "@/lib/auth"
import { db, MAX_SCAN_FINDINGS, STUCK_AFTER_MS, accessibleRepos, activeInstallation, canReadRepo, installationById, noteRepo, repoRecord, type InstallationDoc, type ScanDoc, type ScanFinding, type ScanRepo } from "@/lib/db"
import { catalogRules } from "@/lib/rules/catalog"
import { confirmContentMatches, evaluateRules, scannableRules, type PushContext } from "@/lib/engine"
import {
  compareLink,
  findingsMarkdown,
  ownerOf,
  SEVERITY_ORDER,
  toFinding,
  topSeverity,
} from "@/lib/finding"
import { AppError, type ErrorCode } from "@/lib/errors"
import { fetchRepoSnapshot, type UserInstallation } from "@/lib/github"
import { fileOrThreadAlert } from "@/lib/alerts"
import { SCAN_COMMIT_WINDOW } from "@/lib/paging"
import { logger } from "@/lib/logger"
import { getActiveRules } from "@/lib/rules"
import { getActiveAiRules, runAiRules } from "@/lib/ai-rules"
import { drainReviewSessions, enqueueReviewSession } from "@/lib/review-session"
import type { Rule } from "@/schemas/rule"

export const SCAN_LIMITS = { perDay: 25, repos: 20 } as const

// A running scan that has not reported back by now is assumed dead. The
// serverless invocation that owned it was cut off, and goes back in the queue.


// Who is asking, and the token that decides what they may read.
export type Requester = { login: string; token: string }

export async function resolveRequester(): Promise<Requester> {
  const session = await auth()
  if (!session?.user) throw new AppError("unauthorized", "Sign in required")
  const token = await githubToken()
  if (!token) throw new AppError("unauthorized", "Your GitHub session expired. Sign in again.")
  return { login: session.login || session.user.name || "", token }
}

// What the picker may offer, read entirely from the projection.
export async function scanTargets(
  requester: Requester,
): Promise<{ installation: UserInstallation; repos: string[] }[]> {
  const repos = await accessibleRepos(requester.login)
  if (repos.length === 0) return []

  const orgs = [...new Set(repos.map((repo) => ownerOf(repo)))]
  const active = await db.installations()
    .find({ org: { $in: orgs }, active: true })
    .sort({ org: 1 })
    .toArray()

  return active.map((installation) => ({
    installation: {
      id: installation.installationId,
      account: installation.org,
      accountType: installation.accountType ?? "User",
    },
    repos: repos.filter((repo) => ownerOf(repo) === installation.org),
  }))
}

// Branches of one repository, refused unless GitHub lists that repository for
// this user.
export async function branchesFor(
  requester: Requester,
  installationId: number,
  repo: string,
): Promise<{ branches: string[]; defaultBranch: string }> {
  if (!(await canReadRepo(requester.login, repo))) {
    throw new AppError("forbidden", "You do not have access to that repository")
  }

  const stored = await repoRecord(repo)
  if (!stored) return { branches: [], defaultBranch: "" }
  return { branches: stored.branches, defaultBranch: stored.defaultBranch }
}

async function rulesForScan(installation: InstallationDoc | null): Promise<Rule[]> {
  const owned = installation ? await getActiveRules(installation.installedBy) : []
  return scannableRules(owned.length > 0 ? owned : catalogRules)
}

async function usedToday(owner: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  return db.scans().countDocuments({ owner, createdAt: { $gte: since } })
}

// A scan is private to the account that ran it. There is no shareable variant.
export function canReadScan(scan: ScanDoc, owner: string | null): boolean {
  return owner !== null && scan.owner === owner
}

export type ScanRequest = { installationId: number; repo?: string; branch?: string; aiKey?: string }

// Everything that can fail cheaply fails here: the quota, the concurrency rule,
// and, the one that matters, whether this user may read what they asked for.
export async function enqueueScan(requester: Requester, request: ScanRequest): Promise<ScanDoc> {
  if ((await usedToday(requester.login)) >= SCAN_LIMITS.perDay) {
    throw new AppError("rate_limited", `Scans are limited to ${SCAN_LIMITS.perDay} a day.`)
  }

  const installation = await db.installations().findOne({
    installationId: request.installationId,
    active: true,
  })
  if (!installation) throw new AppError("not_found", "No such installation")

  const accessible = await accessibleRepos(requester.login, installation.installationId)
  if (accessible.length === 0) {
    throw new AppError(
      "install_required",
      `Pushguard covers no repositories you can read in ${installation.org}.`,
    )
  }

  if (request.repo && !accessible.includes(request.repo)) {
    throw new AppError("forbidden", "You do not have access to that repository")
  }

  const repos = request.repo ? [request.repo] : accessible.slice(0, SCAN_LIMITS.repos)
  const doc: ScanDoc = {
    _id: crypto.randomUUID(),
    owner: requester.login,
    target: request.repo ?? installation.org,
    ...(request.branch && request.repo ? { branch: request.branch } : {}),
    scope: request.repo ? "repo" : "org",
    ...(request.aiKey ? { aiKey: request.aiKey } : {}),
    status: "queued",
    active: true,
    installationId: installation.installationId,
    account: installation.org,
    repos,
    scanned: [],
    findings: [],
    skippedRepos: request.repo ? 0 : Math.max(0, accessible.length - SCAN_LIMITS.repos),
    filed: [],
    createdAt: new Date(),
  }

  try {
    await db.scans().insertOne(doc)
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new AppError("rate_limited", "A scan is already running. Wait for it to finish.")
    }
    throw error
  }

  logger.info("scan_queued", { id: doc._id, target: doc.target, repos: doc.repos.length })
  return doc
}

export async function runScan(id: string): Promise<void> {
  const scan = await db.scans().findOneAndUpdate(
    { _id: id, status: "queued" },
    { $set: { status: "running", startedAt: new Date() } },
    { returnDocument: "after" },
  )
  if (!scan) return

  try {
    const { findings, scanned } = await collectFindings(scan)
    await db.scans().updateOne(
      { _id: id },
      { $set: { status: "done", findings, scanned, finishedAt: new Date() }, $unset: { active: "" } },
    )
    logger.info("scan_completed", {
      id,
      target: scan.target,
      repos: scanned.length,
      findings: findings.length,
    })

    // Whatever repository-scope rules this scan queued, run now rather than
    // waiting for the cron: it fires once a day on this plan. Started only
    // after the scan is saved, so a session that runs out of time cannot cost
    // the scan its results; it stays queued and resumes.
    if (scan.aiKey) await drainReviewSessions(1)
  } catch (error) {
    const message = error instanceof AppError ? error.message : "Scan failed"
    const errorCode: ErrorCode = error instanceof AppError ? error.code : "internal"
    await db.scans().updateOne(
      { _id: id },
      {
        $set: { status: "failed", error: message, errorCode, finishedAt: new Date() },
        $unset: { active: "" },
      },
    )
    logger.error("scan_failed", {
      id,
      target: scan.target,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

// Reading happens with the installation token, which is the only credential that.
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

        // `changed`-scope AI rules read a file set, and a scan has one: the
        // files the window touched. No push context is passed, so a rule gated
        // on the push event is dropped rather than matched on an unknown.
        // `repository` rules are queued below instead; they cannot finish here.
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
          id: scan._id,
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

  // Repository-scope AI rules are queued rather than run here: they navigate the
  // tree through tools and cannot finish inside this invocation. The scan
  // reports its pattern findings now; the session files its own alert later.
  if (scan.aiKey && installation) {
    const repositoryRules = (await getActiveAiRules(installation.installedBy)).filter(
      (rule) => rule.scope === "repository",
    )
    for (const read of scanned) {
      if (repositoryRules.length === 0 || !read.headSha) break
      // Seeded from what this scan already flagged, plus the files it read.
      // An unseeded agent explores from nothing, and coverage becomes whatever
      // it happens to choose; the pattern hits are the cheapest strong prior.
      const seeds = [
        ...new Set(
          findings
            .filter((finding) => finding.repo === read.repo)
            .flatMap((finding) => finding.files),
        ),
      ]
      await enqueueReviewSession({
        owner: installation.installedBy,
        installationId: scan.installationId,
        repo: read.repo,
        branch: read.branch,
        sha: read.headSha,
        source: "scan",
        ...(read.baseSha ? { baseSha: read.baseSha } : {}),
        rules: repositoryRules.map((rule) => ({
          id: rule.id,
          prompt: rule.prompt,
          severity: rule.severity,
          paths: rule.paths,
          exclude_paths: rule.exclude_paths,
          budget: rule.budget,
          key: scan.aiKey,
          done: false,
        })),
        seeds,
      })
    }
  }

  return { findings, scanned: scanned.sort((a, b) => a.repo.localeCompare(b.repo)) }
}

// Backstop for scans whose invocation died before finishing, and for anything
// the enqueue path failed to start. Safe to run concurrently with itself:
export async function drainScans(limit = 5): Promise<number> {
  await db.scans().updateMany(
    { status: "running", startedAt: { $lt: new Date(Date.now() - STUCK_AFTER_MS) } },
    { $set: { status: "queued" } },
  )
  const queued = await db.scans().find({ status: "queued" }).sort({ createdAt: 1 }).limit(limit).toArray()
  await Promise.all(queued.map((scan) => runScan(scan._id)))
  return queued.length
}

// Nothing reaches GitHub until this runs. A scan result is a draft; filing is
// the deliberate second step, one issue per repository.
export type FilingResult = {
  filed: ScanDoc["filed"]
  failed: { repo: string; reason: string }[]
}

// File findings as GitHub issues. One issue per repository, and each repository
// stands alone.
export async function fileScanFindings(
  scan: ScanDoc,
  filer: Requester,
  repos?: string[],
): Promise<FilingResult> {
  if (scan.status !== "done") throw new AppError("validation_failed", "Scan has not finished")
  if (scan.findings.length === 0) throw new AppError("validation_failed", "Nothing to file")

  const writable = new Set(await accessibleRepos(filer.login, scan.installationId))
  const alreadyFiled = new Set((scan.filed ?? []).map((entry) => entry.repo))
  const wanted = repos ? new Set(repos) : null

  const byRepo = new Map<string, ScanFinding[]>()
  for (const finding of scan.findings) {
    if (!writable.has(finding.repo) || alreadyFiled.has(finding.repo)) continue
    if (wanted && !wanted.has(finding.repo)) continue
    byRepo.set(finding.repo, [...(byRepo.get(finding.repo) ?? []), finding])
  }

  if (byRepo.size === 0) {
    throw new AppError(
      "validation_failed",
      alreadyFiled.size > 0 ? "Those findings are already filed" : "Nothing left to file",
    )
  }

  const filed: ScanDoc["filed"] = []
  const failed: FilingResult["failed"] = []

  for (const [repo, findings] of byRepo) {
    try {
      const installation = await activeInstallation(ownerOf(repo))
      if (!installation) throw new AppError("not_found", "Pushguard is not installed on this account")

      const severity = topSeverity(findings.map((f) => f.severity))
      const ruleIds = findings.map((f) => f.ruleId)
      const read = scan.scanned?.find((s) => s.repo === repo)

      const stored = await repoRecord(repo)
      const target = resolveAlertTarget(repo, stored?.private ?? false)

      const result = await fileOrThreadAlert({
        installationId: installation.installationId,
        target: target.repo,
        severity,
        ruleIds,
        findings,
        source: "scan",
        by: filer.login,
        title: `[${severity}] ${repo}: ${ruleIds.join(", ")}`,
        body: scanIssueBody(findings, filer.login, installation.alertMention, read, target.redactContent),
        repeat: `Still present in a scan by @${filer.login}${read ? ` of \`${read.branch}\` at \`${read.headSha.slice(0, 7)}\`` : ""}.`,
      })

      const entry = { repo, number: result.number, url: result.url }
      await db.scans().updateOne({ _id: scan._id }, { $addToSet: { filed: entry } })
      filed.push(entry)
    } catch (error) {
      const reason =
        error instanceof AppError && error.cause instanceof Error
          ? error.cause.message.split(" - ")[0]
          : error instanceof Error
            ? error.message
            : "Could not report"
      failed.push({ repo, reason })
      logger.warn("scan_filing_failed", { id: scan._id, repo, reason })
    }
  }

  if (filed.length === 0) {
    throw new AppError("upstream_github", failed[0]?.reason ?? "Could not file any findings")
  }

  logger.info("scan_findings_filed", {
    id: scan._id,
    by: filer.login,
    issues: filed.length,
    failed: failed.length,
  })
  return { filed, failed }
}

function scanIssueBody(
  findings: ScanFinding[],
  login: string,
  mention: string | null,
  read: ScanRepo | undefined,
  redactContent: boolean,
): string {
  const lines = [
    mention ? `${mention}, filed from a Pushguard scan by @${login}.` : `Filed from a Pushguard scan by @${login}.`,
    "",
    read
      ? `Read \`${read.branch}\` across ${read.commits} commit${read.commits === 1 ? "" : "s"}, up to \`${read.headSha.slice(0, 7)}\`.`
      : `Read the last ${SCAN_COMMIT_WINDOW} commits on the default branch.`,
    "",
    "### Findings",
    ...findingsMarkdown(findings, redactContent),
  ]
  if (read) lines.push("", compareLink(read.repo, read.baseSha, read.headSha))
  lines.push(
    "",
    "A scan reads committed code. Force pushes, branch deletions and off-hours activity are only",
    "visible while the app is watching, install Pushguard on this repository to catch them live.",
  )
  return lines.join("\n")
}
