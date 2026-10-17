import { activeInstallation } from "@/lib/db"
import type { DependentHit } from "@/lib/dependent-match"
import { MAX_DEPENDENT_ALERTS } from "@/lib/db/limits"
import { ownerOf, toFinding } from "@/lib/finding"
import { fileFindingsAlert } from "@/lib/findings-alert"
import { logger } from "@/lib/logger"
import { announce } from "@/lib/realtime"
import type { JobMessage } from "@/schemas/job"

const FLAGGED = {
  id: "dependency-now-malicious",
  severity: "critical" as const,
  description: "A dependency this repository already uses is now flagged malicious",
}

const tick = (value: string) => `\`${value.replaceAll("`", "")}\``

// One critical alert per repository, threaded onto an open one for the same rule.
export async function alertDependents(hits: Map<string, DependentHit[]>): Promise<void> {
  const repos = [...hits.keys()]
  if (repos.length > MAX_DEPENDENT_ALERTS) {
    logger.warn("dependent_alerts_capped", { repos: repos.length, cap: MAX_DEPENDENT_ALERTS })
  }
  for (const repo of repos.slice(0, MAX_DEPENDENT_ALERTS)) {
    const installation = await activeInstallation(ownerOf(repo))
    if (!installation) continue
    const repoHits = hits.get(repo)!
    const lines = repoHits.map(
      ({ row, entry }) =>
        `${tick(`${row.ecosystem}:${row.name}@${row.version || "unpinned"}`)} in ${tick(row.manifestPath)}, listed by ${entry.source} as ${tick(entry.advisoryId)}`,
    )
    const finding = toFinding(FLAGGED, repo, [...new Set(repoHits.map((h) => h.row.manifestPath))], lines, { prose: true })
    await fileFindingsAlert({
      installationId: installation.installationId,
      repo,
      findings: [finding],
      source: "push",
      intro: `A dependency already in \`${repo}\` has been flagged malicious. Remove or pin it and rotate any secrets the install could reach.`,
      repeat: lines.join("; "),
    })
    await announce(installation.org, "alert")
    logger.info("dependent_alert_filed", { repo, packages: repoHits.length })
  }
}

// GitHub's own match from a dependabot_alert event: same finding, so it threads
// with ours when both see the same package.
export async function alertDependabotMalware(job: Extract<JobMessage, { type: "dependabot_malware" }>): Promise<void> {
  const installation = await activeInstallation(ownerOf(job.repo))
  if (!installation) return
  const line = `${tick(`${job.ecosystem}:${job.name}`)}${job.range ? ` ${tick(job.range)}` : ""} in ${tick(job.manifest)}, listed by GitHub as ${tick(job.advisory)}: ${job.url}`
  await fileFindingsAlert({
    installationId: installation.installationId,
    repo: job.repo,
    findings: [toFinding(FLAGGED, job.repo, [job.manifest], [line], { prose: true })],
    source: "push",
    intro: `A dependency already in \`${job.repo}\` has been flagged malicious. Remove or pin it and rotate any secrets the install could reach.`,
    repeat: line,
  })
  await announce(installation.org, "alert")
}
