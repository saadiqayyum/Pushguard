import { resolveAlertTarget } from "@/lib/alert-target"
import {
  accessibleRepos,
  activeInstallation,
  addScanFiling,
  repoRecord,
  scanById,
  setScanFilingFailed,
  type ScanDoc,
  type ScanFinding,
  type ScanRepo,
} from "@/lib/db"
import { compareLink, findingsMarkdown, ownerOf, topSeverity } from "@/lib/finding"
import { AppError } from "@/lib/errors"
import { fileOrThreadAlert } from "@/lib/alerts"
import { SCAN_COMMIT_WINDOW } from "@/lib/paging"
import { logger } from "@/lib/logger"
import type { JobMessage } from "@/schemas/job"

type FilingResult = {
  filed: ScanDoc["filed"]
  failed: { repo: string; reason: string }[]
}

// The file_scan job. The filer and the scan's ownership were checked by
// app.enqueue_scan_filing; access to each repository is checked again here.
export async function fileQueuedScan({ id, by, repos }: Extract<JobMessage, { type: "file_scan" }>): Promise<void> {
  const scan = await scanById(id)
  if (!scan || scan.owner !== by) return
  try {
    await fileScanFindings(scan, by, repos ?? undefined)
  } catch (error) {
    if (!(error instanceof AppError) || error.code === "rate_limited") throw error
    logger.warn("scan_filing_skipped", { id, reason: error.message })
  }
}

// One issue per repository, each standing alone. Nothing reaches GitHub until
// the owner files: a scan result is a draft.
async function fileScanFindings(  scan: ScanDoc,
  filer: string,
  repos?: string[],
): Promise<FilingResult> {
  if (scan.status !== "done") throw new AppError("validation_failed", "Scan has not finished")
  if (scan.findings.length === 0) throw new AppError("validation_failed", "Nothing to file")

  const writable = new Set(await accessibleRepos(filer, scan.installationId))
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
        by: filer,
        title: `[${severity}] ${repo}: ${ruleIds.join(", ")}`,
        body: scanIssueBody(findings, filer, installation.alertMention, read, target.redactContent),
        repeat: `Still present in a scan by @${filer}${read ? ` of \`${read.branch}\` at \`${read.headSha.slice(0, 7)}\`` : ""}.`,
      })
      const filing = { repo, number: result.number, url: result.url }
      await addScanFiling(scan.id, filing)
      filed.push(filing)
    } catch (error) {
      const reason =
        error instanceof AppError && error.cause instanceof Error
          ? error.cause.message.split(" - ")[0]
          : error instanceof Error
            ? error.message
            : "Could not report"
      failed.push({ repo, reason })
      logger.warn("scan_filing_failed", { id: scan.id, repo, reason })
    }
  }

  await setScanFilingFailed(scan.id, failed)
  if (filed.length === 0) {
    throw new AppError("upstream_github", failed[0]?.reason ?? "Could not file any findings")
  }

  logger.info("scan_findings_filed", {
    id: scan.id,
    by: filer,
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
