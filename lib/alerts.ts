import { resolveAlertTarget } from "@/lib/alert-target"
import { analyzeDiff } from "@/lib/ai"
import type { InstallationDoc } from "@/lib/db"
import { confirmContentMatches, type ConfirmedMatch, type RuleMatch } from "@/lib/engine"
import { createAlertIssue, fetchAddedLines, findOpenAlertBySha, type CompareResult } from "@/lib/github"
import { logger } from "@/lib/logger"
import type { Severity } from "@/schemas/rule"
import type { PushPayload } from "@/schemas/webhook"

const SEVERITY_ORDER: Severity[] = ["low", "medium", "high", "critical"]
const EMPTY_SHA = "0".repeat(40)

export async function processMatches(
  installation: InstallationDoc,
  payload: PushPayload,
  matches: RuleMatch[],
): Promise<void> {
  const repo = payload.repository.full_name
  const sha = payload.after
  const { installationId } = installation

  const target = resolveAlertTarget(installation.alertsRepo, repo, payload.repository.private)
  if (!target) {
    logger.warn("alert_skipped_public_repo_unconfigured", { org: installation.org, repo, sha })
    return
  }

  if (await findOpenAlertBySha(installationId, target, sha)) {
    logger.info("alert_deduplicated", { repo, sha })
    return
  }

  const canDiff = payload.before !== EMPTY_SHA && payload.after !== EMPTY_SHA
  const needsDiff = matches.some((m) => m.needsDiff) && canDiff
  const diff: CompareResult | null = needsDiff
    ? await fetchAddedLines(installationId, repo, payload.before, payload.after)
    : null

  const confirmed = confirmContentMatches(matches, diff?.addedLines ?? null)
  if (confirmed.length === 0) {
    logger.info("alert_dismissed_no_content_match", { repo, sha })
    return
  }

  const aiSections: string[] = []
  for (const match of confirmed) {
    if (!match.rule.ai || !diff) continue
    const verdict = await analyzeDiff(match.rule.ai, diff.addedLines)
    aiSections.push(
      verdict
        ? `**AI review (${match.rule.id})** — risk: ${verdict.risk}\n${verdict.summary}`
        : `**AI review (${match.rule.id})** — analysis unavailable`,
    )
  }

  const severity = topSeverity(confirmed)
  const mention =
    SEVERITY_ORDER.indexOf(severity) >= SEVERITY_ORDER.indexOf("high")
      ? installation.alertMention ?? undefined
      : undefined
  const title = `[${severity}] ${repo}: ${confirmed.map((m) => m.rule.id).join(", ")}`
  const body = buildBody(payload, confirmed, aiSections, diff?.truncated ?? false, mention)

  const issue = await createAlertIssue(
    installationId,
    target,
    title,
    body,
    ["pushguard", `severity:${severity}`],
    assigneesFor(installation.alertMention),
  )
  logger.info("alert_created", {
    repo,
    target,
    sha,
    issue: issue.number,
    rules: confirmed.map((m) => m.rule.id),
  })
}

function topSeverity(matches: ConfirmedMatch[]): Severity {
  return matches
    .map((m) => m.rule.severity)
    .reduce((a, b) => (SEVERITY_ORDER.indexOf(b) > SEVERITY_ORDER.indexOf(a) ? b : a))
}

// Put the alert on someone's "Assigned to you" list. Only a user handle can be
// assigned: `org/team` mentions have no assignable identity, so they get the
// @mention only. Assigning the pusher would be wrong — that account is the
// thing under suspicion.
export function assigneesFor(alertMention: string | null): string[] {
  if (!alertMention) return []
  const handle = alertMention.replace(/^@/, "")
  return handle.includes("/") ? [] : [handle]
}

// A compare against the empty SHA 404s on GitHub, which is exactly the case on
// a branch's first push — link the commit itself instead.
function reviewLink(payload: PushPayload): string {
  const repo = payload.repository.full_name
  return payload.before === EMPTY_SHA
    ? `[View commit](https://github.com/${repo}/commit/${payload.after})`
    : `[Compare view](https://github.com/${repo}/compare/${payload.before}...${payload.after})`
}

function buildBody(
  payload: PushPayload,
  matches: ConfirmedMatch[],
  aiSections: string[],
  truncated: boolean,
  mention?: string,
): string {
  const branch = payload.ref.replace("refs/heads/", "")
  const lines = [
    mention ? `${mention} — flagged push requires review.` : "Flagged push requires review.",
    "",
    "| | |",
    "|---|---|",
    `| Repository | ${payload.repository.full_name} |`,
    `| Branch | ${branch} |`,
    `| Pushed by | @${payload.sender.login} (${payload.pusher.email ?? "no email"}) |`,
    `| Force push | ${payload.forced ? "yes" : "no"} |`,
    `| Before | ${payload.before === EMPTY_SHA ? "— (branch created)" : payload.before} |`,
    `| After | ${payload.after} |`,
    "",
    "### Matched rules",
    ...matches.map((m) => {
      const files =
        m.matchedFiles.length > 0
          ? ` — files: ${m.matchedFiles
              .slice(0, 20)
              .map((f) => `\`${f.replaceAll("`", "")}\``)
              .join(", ")}`
          : ""
      const hits = m.matchedLines.length > 0 ? ` — ${m.matchedLines.length} matching line(s)` : ""
      return `- **${m.rule.id}** (${m.rule.severity})${m.rule.description ? `: ${m.rule.description}` : ""}${files}${hits}`
    }),
  ]
  if (aiSections.length > 0) lines.push("", ...aiSections)
  if (truncated) lines.push("", "Diff exceeded the size cap and was truncated; review the full compare on GitHub.")
  if (payload.before === EMPTY_SHA) {
    lines.push("", "Branch had no previous head, so content rules were reported without diff confirmation.")
  }
  lines.push("", reviewLink(payload))
  return lines.join("\n")
}
