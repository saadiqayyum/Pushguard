import { resolveAlertTarget } from "@/lib/alert-target"
import { compareLink, findingsMarkdown, SEVERITY_ORDER, toFinding, topSeverity } from "@/lib/finding"
import { analyzeDiff } from "@/lib/ai"
import {
  alertExistsForCommit,
  openAlertForRules,
  recordAlert,
  recordOccurrence,
  type AlertDoc,
  type InstallationDoc,
  type ScanFinding,
} from "@/lib/db"
import { confirmContentMatches, type ConfirmedMatch, type RuleMatch } from "@/lib/engine"
import { commentOnIssue, createAlertIssue, fetchAddedLines, type CompareResult } from "@/lib/github"
import { logger } from "@/lib/logger"
import type { Severity } from "@/schemas/rule"
import type { PushPayload } from "@/schemas/webhook"

const EMPTY_SHA = "0".repeat(40)

/**
 * The repeat wording for a push: a reference, not a re-report.
 *
 * Everything about what matched is already in the issue above, restating the
 * rules, files and lines on every recurrence buries the discussion under copies
 * of the opening post. What a reader needs is who did it again, where, and a
 * link to look.
 */
function buildRepeat(payload: PushPayload): string {
  const branch = payload.ref.replace("refs/heads/", "")
  return `Seen again on \`${branch}\` by @${payload.sender.login}, ${reviewLink(payload)}`
}

export type FiledAlert = { number: number; url: string; threaded: boolean }

/**
 * The one place an alert reaches GitHub.
 *
 * Both callers. A push that matched, and a scan somebody reported, need the
 * same decision: is this already open here, in which case add to it, or is it
 * new, in which case open it. Having that logic twice meant fixing threading on
 * the push path and shipping a scan path that still opened duplicates.
 *
 * What genuinely differs between the two is the wording, so the caller supplies
 * `body` for a new issue and `repeat` for a comment on an existing one. Nothing
 * else about the decision is theirs to make.
 */
export async function fileOrThreadAlert(input: {
  installationId: number
  target: string
  severity: Severity
  ruleIds: string[]
  findings: ScanFinding[]
  source: "push" | "scan"
  title: string
  body: string
  repeat: string
  assignees?: string[]
  push?: AlertDoc["push"]
}): Promise<FiledAlert> {
  const existing = await openAlertForRules(input.target, input.ruleIds)
  if (existing) {
    const seen = await recordOccurrence(existing._id)
    await commentOnIssue(
      input.installationId,
      input.target,
      existing.number,
      `${input.repeat}\n\nOccurrence ${seen}.`,
    )
    logger.info("alert_threaded", {
      target: input.target,
      issue: existing.number,
      occurrence: seen,
      source: input.source,
    })
    return { number: existing.number, url: existing.url, threaded: true }
  }

  const issue = await createAlertIssue(
    input.installationId,
    input.target,
    input.title,
    input.body,
    ["pushguard", `severity:${input.severity}`, ...(input.source === "scan" ? ["scan"] : [])],
    input.assignees ?? [],
  )
  await recordAlert({
    repo: input.target,
    number: issue.number,
    url: issue.html_url,
    title: input.title,
    severity: input.severity,
    ruleIds: input.ruleIds,
    findings: input.findings,
    ...(input.push ? { push: input.push } : {}),
    source: input.source,
    createdAt: new Date(),
  })
  logger.info("alert_created", {
    target: input.target,
    issue: issue.number,
    rules: input.ruleIds,
    source: input.source,
  })
  return { number: issue.number, url: issue.html_url, threaded: false }
}

export async function processMatches(
  installation: InstallationDoc,
  payload: PushPayload,
  matches: RuleMatch[],
): Promise<void> {
  const repo = payload.repository.full_name
  const sha = payload.after
  const { installationId } = installation

  const target = resolveAlertTarget(repo, payload.repository.private)
  if (!target) {
    logger.warn("alert_skipped_public_repo_unconfigured", { org: installation.org, repo, sha })
    return
  }

  // Redelivered webhook or a retry: this exact commit was already reported.
  // A local read rather than a GitHub issue search, reads do not call GitHub.
  if (await alertExistsForCommit(target, sha)) {
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
        ? `**AI review (${match.rule.id})**, risk: ${verdict.risk}\n${verdict.summary}`
        : `**AI review (${match.rule.id})**, analysis unavailable`,
    )
  }

  const ruleIds = confirmed.map((m) => m.rule.id)
  const severity = topSeverity(confirmed.map((m) => m.rule.severity))
  const mention =
    SEVERITY_ORDER.indexOf(severity) >= SEVERITY_ORDER.indexOf("high")
      ? installation.alertMention ?? undefined
      : undefined

  const filed = await fileOrThreadAlert({
    installationId,
    target,
    severity,
    ruleIds,
    findings: confirmed.map((match) => toFinding(match.rule, repo, match.matchedFiles, match.matchedLines)),
    source: "push",
    title: `[${severity}] ${repo}: ${ruleIds.join(", ")}`,
    body: buildBody(payload, confirmed, aiSections, diff?.truncated ?? false, mention),
    repeat: buildRepeat(payload),
    assignees: assigneesFor(installation.alertMention),
    push: {
      branch: payload.ref.replace("refs/heads/", ""),
      sender: payload.sender.login,
      pusherEmail: payload.pusher.email ?? null,
      before: payload.before,
      after: payload.after,
      forced: payload.forced,
    },
  })
  logger.info("push_alert_filed", { repo, target, sha, issue: filed.number, threaded: filed.threaded })

}



// Put the alert on someone's "Assigned to you" list. Only a user handle can be
// assigned: `org/team` mentions have no assignable identity, so they get the
// @mention only. Assigning the pusher would be wrong. That account is the
// thing under suspicion.
export function assigneesFor(alertMention: string | null): string[] {
  if (!alertMention) return []
  const handle = alertMention.replace(/^@/, "")
  return handle.includes("/") ? [] : [handle]
}

// A compare against the empty SHA 404s on GitHub, which is exactly the case on
// a branch's first push, `compareLink` links the commit itself when there is
// no base to compare against.
function reviewLink(payload: PushPayload): string {
  return compareLink(
    payload.repository.full_name,
    payload.before === EMPTY_SHA ? null : payload.before,
    payload.after,
  )
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
    mention ? `${mention}, flagged push requires review.` : "Flagged push requires review.",
    "",
    "| | |",
    "|---|---|",
    `| Repository | ${payload.repository.full_name} |`,
    `| Branch | ${branch} |`,
    `| Pushed by | @${payload.sender.login} (${payload.pusher.email ?? "no email"}) |`,
    `| Force push | ${payload.forced ? "yes" : "no"} |`,
    `| Before | ${payload.before === EMPTY_SHA ? ", (branch created)" : payload.before} |`,
    `| After | ${payload.after} |`,
    "",
    "### Matched rules",
    ...findingsMarkdown(
      matches.map((m) =>
        toFinding(m.rule, payload.repository.full_name, m.matchedFiles, m.matchedLines),
      ),
    ),
  ]
  if (aiSections.length > 0) lines.push("", ...aiSections)
  if (truncated) lines.push("", "Diff exceeded the size cap and was truncated; review the full compare on GitHub.")
  if (payload.before === EMPTY_SHA) {
    lines.push("", "Branch had no previous head, so content rules were reported without diff confirmation.")
  }
  lines.push("", reviewLink(payload))
  return lines.join("\n")
}
