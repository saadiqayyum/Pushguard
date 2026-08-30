import { auth, githubToken } from "@/lib/auth"
import {
  accessibleRepos,
  activeInstallation,
  canReadRepo,
  installationById,
  installationsCollection,
  noteRepo,
  repoRecord,
  scansCollection,
  type InstallationDoc,
  type ScanDoc,
  type ScanFinding,
  type ScanRepo,
} from "@/lib/db"
import { defaultRules } from "@/lib/default-rules"
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
import type { Rule } from "@/schemas/rule"

export const SCAN_LIMITS = { perDay: 25, repos: 20 } as const

// A running scan that has not reported back by now is assumed dead. The
// serverless invocation that owned it was cut off, and goes back in the queue.
const STUCK_AFTER_MS = 5 * 60 * 1000

const MAX_FINDINGS = 500

/**
 * Who is asking, and the token that decides what they may read.
 *
 * There is no anonymous variant. A scan reads source and reports the lines it
 * matched, so every one of them is authorised against the caller's own GitHub
 * access, never against an installation token, which sees more than any single
 * member is entitled to.
 */
export type Requester = { login: string; token: string }

export async function resolveRequester(): Promise<Requester> {
  const session = await auth()
  if (!session?.user) throw new AppError("unauthorized", "Sign in required")
  const token = await githubToken()
  if (!token) throw new AppError("unauthorized", "Your GitHub session expired. Sign in again.")
  return { login: session.login || session.user.name || "", token }
}

/**
 * What the picker may offer, read entirely from the projection.
 *
 * No GitHub call: `repo_access` already says which repositories this account can
 * read, maintained by the member, membership, team and organization webhooks.
 * The list is grouped back into installations so the picker keeps its shape.
 */
export async function scanTargets(
  requester: Requester,
): Promise<{ installation: UserInstallation; repos: string[] }[]> {
  const repos = await accessibleRepos(requester.login)
  if (repos.length === 0) return []

  const orgs = [...new Set(repos.map((repo) => ownerOf(repo)))]
  const installations = await (await installationsCollection())
    .find({ org: { $in: orgs }, active: true })
    .sort({ org: 1 })
    .toArray()

  return installations.map((installation) => ({
    installation: {
      id: installation.installationId,
      account: installation.org,
      accountType: installation.accountType ?? "User",
    },
    repos: repos.filter((repo) => ownerOf(repo) === installation.org),
  }))
}

/**
 * Branches of one repository, refused unless GitHub lists that repository for
 * this user.
 *
 * The database is the source of truth. GitHub is read exactly once per
 * repository. The first time anyone asks and no record exists, and after that
 * the record is maintained by the `create`, `delete`, `repository` and `push`
 * webhooks. There is no expiry and no revalidation: a stored list is not a copy
 * that might have gone stale, it is the current state as GitHub last reported
 * it.
 *
 * The access check above is deliberately NOT stored. Which repositories a user
 * may read is asked of GitHub on every call, because that answer changes
 * without any webhook telling us.
 */
export async function branchesFor(
  requester: Requester,
  installationId: number,
  repo: string,
): Promise<{ branches: string[]; defaultBranch: string }> {
  if (!(await canReadRepo(requester.login, repo))) {
    throw new AppError("forbidden", "You do not have access to that repository")
  }

  const stored = await repoRecord(repo)
  // Never synced means the install backfill has not reached it yet. Offering
  // the default alone is honest and costs nothing; the create/delete webhooks
  // fill the rest in as branches move.
  if (!stored) return { branches: [], defaultBranch: "" }
  return { branches: stored.branches, defaultBranch: stored.defaultBranch }
}

async function rulesForScan(installation: InstallationDoc | null): Promise<Rule[]> {
  const owned = installation ? await getActiveRules(installation.installedBy) : []
  return scannableRules(owned.length > 0 ? owned : defaultRules)
}

async function usedToday(owner: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  return (await scansCollection()).countDocuments({ owner, createdAt: { $gte: since } })
}

/** A scan is private to the account that ran it. There is no shareable variant. */
export function canReadScan(scan: ScanDoc, owner: string | null): boolean {
  return owner !== null && scan.owner === owner
}

export type ScanRequest = { installationId: number; repo?: string; branch?: string }

/**
 * Everything that can fail cheaply fails here: the quota, the concurrency rule,
 * and, the one that matters, whether this user may read what they asked for.
 *
 * The picker is a convenience, not a control: this request body arrived over
 * the wire and can name any installation or repository at all. So the accessible
 * list is fetched again here, with the user's own token, and the request is
 * checked against it. That check is the authorization boundary.
 */
export async function enqueueScan(requester: Requester, request: ScanRequest): Promise<ScanDoc> {
  if ((await usedToday(requester.login)) >= SCAN_LIMITS.perDay) {
    throw new AppError("rate_limited", `Scans are limited to ${SCAN_LIMITS.perDay} a day.`)
  }

  const installation = await (await installationsCollection()).findOne({
    installationId: request.installationId,
    active: true,
  })
  // Same answer for an installation that does not exist and one that is not
  // theirs: the id is not a hint worth confirming.
  if (!installation) throw new AppError("not_found", "No such installation")

  // The authorization check, served from the projection rather than GitHub.
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
    // Only ever set alongside a single repository; a whole-account scan reads
    // each repository's own default branch.
    ...(request.branch && request.repo ? { branch: request.branch } : {}),
    scope: request.repo ? "repo" : "org",
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
    await (await scansCollection()).insertOne(doc)
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
  const scans = await scansCollection()
  // Claim before working: the enqueue path and the cron can both reach for the
  // same scan, and only one of them may run it.
  const scan = await scans.findOneAndUpdate(
    { _id: id, status: "queued" },
    { $set: { status: "running", startedAt: new Date() } },
    { returnDocument: "after" },
  )
  if (!scan) return

  try {
    const { findings, scanned } = await collectFindings(scan)
    await scans.updateOne(
      { _id: id },
      { $set: { status: "done", findings, scanned, finishedAt: new Date() }, $unset: { active: "" } },
    )
    logger.info("scan_completed", {
      id,
      target: scan.target,
      repos: scanned.length,
      findings: findings.length,
    })
  } catch (error) {
    const message = error instanceof AppError ? error.message : "Scan failed"
    const errorCode: ErrorCode = error instanceof AppError ? error.code : "internal"
    await scans.updateOne(
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

// Reading happens with the installation token, which is the only credential that
// can fetch a diff. That is safe because `repos` was already narrowed to what the
// requester could read. The check lives at enqueue, not here.
async function collectFindings(
  scan: ScanDoc,
): Promise<{ findings: ScanFinding[]; scanned: ScanRepo[] }> {
  const installation = await installationById(scan.installationId)
  const rules = await rulesForScan(installation)
  const hourUtc = new Date().getUTCHours()
  // Why each repo could not be read, so a total failure can be explained rather
  // than blamed on GitHub. Pushed from parallel tasks; order does not matter.
  const failures: ErrorCode[] = []
  const scanned: ScanRepo[] = []

  const results = await Promise.all(
    scan.repos.map(async (repo) => {
      try {
        // A stored default branch removes one of the three GitHub calls this
        // repository would otherwise cost. Absent, fetchRepoSnapshot asks.
        const known = scan.branch ? undefined : (await repoRecord(repo))?.defaultBranch
        const snapshot = await fetchRepoSnapshot(repo, scan.installationId, scan.branch ?? known)
        const context: PushContext = {
          repo: snapshot.repo,
          branch: snapshot.branch,
          forced: false,
          // A scan reads committed code and knows nothing about who pushed it.
          senderFirstPush: false,
          branchCreated: false,
          branchDeleted: false,
          hourUtc,
          files: snapshot.files,
        }
        // Free correction: the snapshot just told us the real default.
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
        return confirmed.map((match) =>
          toFinding(match.rule, snapshot.repo, match.matchedFiles, match.matchedLines),
        )
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
    // Every repo unreadable through an installation that was supposed to cover
    // them means the app was removed from them between the picker and the run.
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
    .slice(0, MAX_FINDINGS)

  return { findings, scanned: scanned.sort((a, b) => a.repo.localeCompare(b.repo)) }
}

// Backstop for scans whose invocation died before finishing, and for anything
// the enqueue path failed to start. Safe to run concurrently with itself:
// runScan claims each row first.
export async function drainScans(limit = 5): Promise<number> {
  const scans = await scansCollection()
  await scans.updateMany(
    { status: "running", startedAt: { $lt: new Date(Date.now() - STUCK_AFTER_MS) } },
    { $set: { status: "queued" } },
  )
  const queued = await scans.find({ status: "queued" }).sort({ createdAt: 1 }).limit(limit).toArray()
  await Promise.all(queued.map((scan) => runScan(scan._id)))
  return queued.length
}

// Nothing reaches GitHub until this runs. A scan result is a draft; filing is
// the deliberate second step, one issue per repository.
export type FilingResult = {
  filed: ScanDoc["filed"]
  failed: { repo: string; reason: string }[]
}

/**
 * File findings as GitHub issues. One issue per repository, and each repository
 * stands alone.
 *
 * Every write is isolated and persisted as it succeeds. The first version filed
 * them in a loop and saved the results at the end, so a repository with issues
 * disabled. A normal thing for a mirror or a docs repo, threw, the request
 * 502'd, and the issues already created on GitHub were orphaned: real tickets
 * that the app then insisted had never been filed. A partial success has to be
 * recorded as a partial success.
 *
 * `repos` narrows it to a subset. Repositories already filed are skipped rather
 * than duplicated, so re-filing after a failure only picks up what is missing.
 */
export async function fileScanFindings(
  scan: ScanDoc,
  filer: Requester,
  repos?: string[],
): Promise<FilingResult> {
  if (scan.status !== "done") throw new AppError("validation_failed", "Scan has not finished")
  if (scan.findings.length === 0) throw new AppError("validation_failed", "Nothing to file")

  // Access is re-checked at write time rather than trusted from the scan: the
  // findings may be days old, and someone's access can be revoked in between.
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

  const scans = await scansCollection()
  const filed: ScanDoc["filed"] = []
  const failed: FilingResult["failed"] = []

  for (const [repo, findings] of byRepo) {
    try {
      const installation = await activeInstallation(ownerOf(repo))
      if (!installation) throw new AppError("not_found", "Pushguard is not installed on this account")

      const severity = topSeverity(findings.map((f) => f.severity))
      const ruleIds = findings.map((f) => f.ruleId)
      const read = scan.scanned?.find((s) => s.repo === repo)

      // The same decision as the push path, made by the same function: add to
      // an open issue if one covers these rules, otherwise open one.
      const result = await fileOrThreadAlert({
        installationId: installation.installationId,
        target: repo,
        severity,
        ruleIds,
        findings,
        source: "scan",
        title: `[${severity}] ${repo}: ${ruleIds.join(", ")}`,
        body: scanIssueBody(findings, filer.login, installation.alertMention, read),
        // A reference, not a re-report. The rules and lines are already above.
        repeat: `Still present in a scan by @${filer.login}${read ? ` of \`${read.branch}\` at \`${read.headSha.slice(0, 7)}\`` : ""}.`,
      })

      const entry = { repo, number: result.number, url: result.url }
      // Saved immediately. An issue that exists on GitHub and not here is the
      // failure mode this whole shape exists to prevent.
      await scans.updateOne({ _id: scan._id }, { $addToSet: { filed: entry } })
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
): string {
  const lines = [
    mention ? `${mention}, filed from a Pushguard scan by @${login}.` : `Filed from a Pushguard scan by @${login}.`,
    "",
    read
      ? `Read \`${read.branch}\` across ${read.commits} commit${read.commits === 1 ? "" : "s"}, up to \`${read.headSha.slice(0, 7)}\`.`
      : `Read the last ${SCAN_COMMIT_WINDOW} commits on the default branch.`,
    "",
    "### Findings",
    ...findingsMarkdown(findings),
  ]
  if (read) lines.push("", compareLink(read.repo, read.baseSha, read.headSha))
  lines.push(
    "",
    "A scan reads committed code. Force pushes, branch deletions and off-hours activity are only",
    "visible while the app is watching, install Pushguard on this repository to catch them live.",
  )
  return lines.join("\n")
}
