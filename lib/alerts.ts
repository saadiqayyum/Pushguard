import { resolveAlertTarget } from "@/lib/alert-target"
import {
  compareLink,
  erasureMarkdown,
  findingsMarkdown,
  SEVERITY_ORDER,
  toFinding,
  topSeverity,
  type ForcePushForensics,
} from "@/lib/finding"
import { analyseChangedJavaScript } from "@/lib/xray"
import {
  alertForCommit,
  attachPullRequest,
  openAlertForRules,
  recordAlert,
  recordOccurrence,
  type AlertDoc,
  type InstallationDoc,
  type ScanFinding,
} from "@/lib/db"
import { confirmContentMatches, type ConfirmedMatch, type RuleMatch } from "@/lib/engine"
import {
  commentOnIssue,
  createAlertIssue,
  DIFF_READ_BUDGET,
  fetchAddedLines,
  type CompareResult,
} from "@/lib/github"
import { logger } from "@/lib/logger"
import type { Severity } from "@/schemas/rule"
import { EMPTY_SHA, type ChangeEvent } from "@/lib/change-event"

// A diff too big to read is a blind spot, and blind spots are where things get
// put.
const TRUNCATED_FINDING = {
  id: "diff-not-fully-read",
  severity: "high" as const,
  description: "The diff exceeded the read budget, so part of this push was never scanned",
}

// The repeat wording for a push: a reference, not a re-report.
function buildRepeat(
  event: ChangeEvent,
  forensics: ForcePushForensics | null,
  extra: ScanFinding[],
  redactContent: boolean,
): string {
  const where = event.pullRequest ? `pull request #${event.pullRequest.number}` : `\`${event.branch}\``
  const lines = [`Seen again on ${where} by @${event.sender}, ${reviewLink(event)}`]

  if (extra.length > 0) {
    lines.push("", "### Found by analysis on this push", ...findingsMarkdown(extra, redactContent))
  }

  if (forensics) {
    lines.push(
      ...erasureMarkdown(forensics, event.repo, event.before),
      "",
      "### Rules matched against the erased content",
      ...findingsMarkdown(forensics.findings, redactContent),
    )
  }
  return lines.join("\n")
}

const SOURCE_LABELS: Record<AlertDoc["source"], string[]> = {
  push: [],
  scan: ["scan"],
  pull_request: ["pull-request"],
}

export type FiledAlert = { number: number; url: string; threaded: boolean }

// The one place an alert reaches GitHub.
// The pull request gets one comment per alert, on the first sighting from it.
async function commentOnPullRequest(input: {
  installationId: number
  target: string
  pullRequest: NonNullable<AlertDoc["pullRequest"]>
  issue: number
  severity: Severity
  ruleIds: string[]
}): Promise<void> {
  await commentOnIssue(
    input.installationId,
    input.target,
    input.pullRequest.number,
    `Pushguard flagged this pull request. See #${input.issue} for the ${input.severity} finding${input.ruleIds.length === 1 ? "" : "s"}: \`${input.ruleIds.join("\`, \`")}\`.`,
  )
}

export async function fileOrThreadAlert(input: {
  installationId: number
  target: string
  severity: Severity
  ruleIds: string[]
  findings: ScanFinding[]
  source: AlertDoc["source"]
  title: string
  body: string
  repeat: string
  assignees?: string[]
  push?: AlertDoc["push"]
  pullRequest?: AlertDoc["pullRequest"]
  by?: string
}): Promise<FiledAlert> {
  const existing = await openAlertForRules(input.target, input.ruleIds)
  if (existing) {
    const pullRequestSeen =
      input.pullRequest !== undefined &&
      (existing.pullRequest?.number === input.pullRequest.number ||
        (existing.sightings ?? []).some((s) => s.pullRequest === input.pullRequest?.number))
    const seen = await recordOccurrence(existing._id, {
      ruleIds: input.ruleIds,
      sha: input.push?.after ?? null,
      by: input.push?.sender ?? input.by ?? null,
      ...(input.pullRequest ? { pullRequest: input.pullRequest.number } : {}),
    })
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
      rules: input.ruleIds,
      coveredBy: existing.ruleIds,
    })
    if (input.pullRequest && !pullRequestSeen) {
      await commentOnPullRequest({ ...input, pullRequest: input.pullRequest, issue: existing.number })
    }
    return { number: existing.number, url: existing.url, threaded: true }
  }

  const issue = await createAlertIssue(
    input.installationId,
    input.target,
    input.title,
    input.body,
    ["pushguard", `severity:${input.severity}`, ...SOURCE_LABELS[input.source]],
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
    ...(input.pullRequest ? { pullRequest: input.pullRequest } : {}),
    source: input.source,
    createdAt: new Date(),
  })
  logger.info("alert_created", {
    target: input.target,
    issue: issue.number,
    rules: input.ruleIds,
    source: input.source,
  })
  if (input.pullRequest) {
    await commentOnPullRequest({ ...input, pullRequest: input.pullRequest, issue: issue.number })
  }
  return { number: issue.number, url: issue.html_url, threaded: false }
}

// `forensics` is what a force push removed, already matched against the rules.
export async function processMatches(
  installation: InstallationDoc,
  event: ChangeEvent,
  matches: RuleMatch[],
  forensics: ForcePushForensics | null = null,
  aiFindings: ScanFinding[] = [],
): Promise<void> {
  const { repo, after: sha } = event
  const { installationId } = installation
  const source: AlertDoc["source"] = event.pullRequest ? "pull_request" : "push"

  const target = resolveAlertTarget(repo, event.private)

  const already = await alertForCommit(target.repo, sha)
  if (already) {
    if (event.pullRequest && (await attachPullRequest(already._id, event.pullRequest))) {
      await commentOnPullRequest({
        installationId,
        target: target.repo,
        pullRequest: event.pullRequest,
        issue: already.number,
        severity: already.severity,
        ruleIds: already.ruleIds,
      })
    }
    logger.info("alert_deduplicated", { repo, sha, source, issue: already.number })
    return
  }

  const canDiff = event.before !== EMPTY_SHA && event.after !== EMPTY_SHA
  const needsDiff = matches.some((m) => m.needsDiff) && canDiff
  const diff: CompareResult | null = needsDiff
    ? await fetchAddedLines(installationId, repo, event.before, event.after)
    : null

  const confirmed = confirmContentMatches(matches, diff?.addedLines ?? null)
  if (confirmed.length === 0 && !forensics && !diff?.truncated && aiFindings.length === 0) {
    logger.info("alert_dismissed_no_content_match", { repo, sha })
    return
  }

  const serious = confirmed.filter(
    (match) => SEVERITY_ORDER.indexOf(match.rule.severity) >= SEVERITY_ORDER.indexOf("high"),
  )

  const xray =
    serious.length > 0 ? await analyseChangedJavaScript(installationId, repo, sha, event.files) : []

  const findings = [
    ...(diff?.truncated
      ? [toFinding(TRUNCATED_FINDING, repo, [], [`Read ${DIFF_READ_BUDGET} of a larger diff.`], { prose: true })]
      : []),
    ...confirmed.map((match) =>
      toFinding(match.rule, repo, match.matchedFiles, [...match.matchedMessages, ...match.matchedLines]),
    ),
    ...(forensics?.findings ?? []),
    ...xray,
    ...aiFindings,
  ]
  const ruleIds = [...new Set(findings.map((finding) => finding.ruleId))]
  const severity = topSeverity(findings.map((finding) => finding.severity))
  if (findings.length === 0) {
    logger.info("alert_dismissed_no_findings", { repo, sha })
    return
  }
  const mention =
    SEVERITY_ORDER.indexOf(severity) >= SEVERITY_ORDER.indexOf("high")
      ? installation.alertMention ?? undefined
      : undefined

  const filed = await fileOrThreadAlert({
    installationId,
    target: target.repo,
    severity,
    ruleIds,
    findings,
    source,
    title: `[${severity}] ${repo}: ${ruleIds.join(", ")}`,
    body: buildBody(
      event,
      confirmed,
      [...xray, ...aiFindings],
      diff?.truncated ?? false,
      mention,
      forensics,
      target.redactContent,
    ),
    repeat: buildRepeat(event, forensics, [...xray, ...aiFindings], target.redactContent),
    assignees: assigneesFor(installation.alertMention),
    push: {
      branch: event.branch,
      sender: event.sender,
      pusherEmail: event.senderEmail,
      before: event.before,
      after: event.after,
      forced: event.forced,
    },
    ...(event.pullRequest
      ? { pullRequest: { number: event.pullRequest.number, base: event.pullRequest.base, url: event.pullRequest.url } }
      : {}),
  })
  logger.info("push_alert_filed", {
    repo,
    target: target.repo,
    sha,
    source,
    issue: filed.number,
    threaded: filed.threaded,
    erased: forensics?.erasedCommitCount ?? 0,
  })
}

// Put the alert on someone's "Assigned to you" list. Only a user handle can be.
export function assigneesFor(alertMention: string | null): string[] {
  if (!alertMention) return []
  const handle = alertMention.replace(/^@/, "")
  return handle.includes("/") ? [] : [handle]
}

// A compare against the empty SHA 404s on GitHub, which is exactly the case on.
function reviewLink(event: ChangeEvent): string {
  if (event.pullRequest) return `${event.pullRequest.url}/files`
  return compareLink(event.repo, event.before === EMPTY_SHA ? null : event.before, event.after)
}

function buildBody(
  event: ChangeEvent,
  matches: ConfirmedMatch[],
  extra: ScanFinding[],
  truncated: boolean,
  mention?: string,
  forensics?: ForcePushForensics | null,
  redactContent = false,
): string {
  const what = event.pullRequest ? "pull request" : "push"
  const lines = [
    mention ? `${mention}, flagged ${what} requires review.` : `Flagged ${what} requires review.`,
    "",
    "| | |",
    "|---|---|",
    `| Repository | ${event.repo} |`,
    ...(event.pullRequest
      ? [
          `| Pull request | #${event.pullRequest.number} (${event.pullRequest.url}) |`,
          `| Into | ${event.pullRequest.base} |`,
          `| From | ${event.branch} |`,
          `| Opened by | @${event.sender} |`,
        ]
      : [
          `| Branch | ${event.branch} |`,
          `| Pushed by | @${event.sender} (${event.senderEmail ?? "no email"}) |`,
          `| Force push | ${event.forced ? "yes" : "no"} |`,
        ]),
    `| Before | ${event.before === EMPTY_SHA ? ", (branch created)" : event.before} |`,
    `| After | ${event.after} |`,
  ]
  if (matches.length > 0) {
    lines.push(
      "",
      "### Matched rules",
      ...findingsMarkdown(
        matches.map((m) =>
          toFinding(m.rule, event.repo, m.matchedFiles, [
            ...m.matchedMessages,
            ...m.matchedLines,
          ]),
        ),
        redactContent,
      ),
    )
  }
  if (forensics) {
    lines.push(
      ...erasureMarkdown(forensics, event.repo, event.before),
      "",
      "### Rules matched against the erased content",
      ...findingsMarkdown(forensics.findings, redactContent),
    )
  }
  if (extra.length > 0) {
    lines.push("", "### Found by analysis", ...findingsMarkdown(extra, redactContent))
  }
  if (truncated) {
    lines.push(
      "",
      `This diff was larger than the ${DIFF_READ_BUDGET} read budget, so part of this push was never`,
      "scanned. A rule can only match what was read; nothing here says the unread part is clean.",
      "Review the full compare on GitHub.",
    )
  }
  if (event.before === EMPTY_SHA) {
    lines.push("", "Branch had no previous head, so content rules were reported without diff confirmation.")
  }
  lines.push("", reviewLink(event))
  return lines.join("\n")
}
