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
  alertExistsForCommit,
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
import type { PushPayload } from "@/schemas/webhook"

const EMPTY_SHA = "0".repeat(40)

// A diff too big to read is a blind spot, and blind spots are where things get
// put.
const TRUNCATED_FINDING = {
  id: "diff-not-fully-read",
  severity: "high" as const,
  description: "The diff exceeded the read budget, so part of this push was never scanned",
}

// The repeat wording for a push: a reference, not a re-report.
function buildRepeat(
  payload: PushPayload,
  forensics: ForcePushForensics | null,
  extra: ScanFinding[],
  redactContent: boolean,
): string {
  const branch = payload.ref.replace("refs/heads/", "")
  const lines = [`Seen again on \`${branch}\` by @${payload.sender.login}, ${reviewLink(payload)}`]

  if (extra.length > 0) {
    lines.push("", "### Found by analysis on this push", ...findingsMarkdown(extra, redactContent))
  }

  if (forensics) {
    lines.push(
      ...erasureMarkdown(forensics, payload.repository.full_name, payload.before),
      "",
      "### Rules matched against the erased content",
      ...findingsMarkdown(forensics.findings, redactContent),
    )
  }
  return lines.join("\n")
}

export type FiledAlert = { number: number; url: string; threaded: boolean }

// The one place an alert reaches GitHub.
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
  by?: string
}): Promise<FiledAlert> {
  const existing = await openAlertForRules(input.target, input.ruleIds)
  if (existing) {
    const seen = await recordOccurrence(existing._id, {
      ruleIds: input.ruleIds,
      sha: input.push?.after ?? null,
      by: input.push?.sender ?? input.by ?? null,
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

// `forensics` is what a force push removed, already matched against the rules.
export async function processMatches(
  installation: InstallationDoc,
  payload: PushPayload,
  matches: RuleMatch[],
  forensics: ForcePushForensics | null = null,
  aiFindings: ScanFinding[] = [],
): Promise<void> {
  const repo = payload.repository.full_name
  const sha = payload.after
  const { installationId } = installation

  const target = resolveAlertTarget(repo, payload.repository.private)

  if (await alertExistsForCommit(target.repo, sha)) {
    logger.info("alert_deduplicated", { repo, sha })
    return
  }

  const canDiff = payload.before !== EMPTY_SHA && payload.after !== EMPTY_SHA
  const needsDiff = matches.some((m) => m.needsDiff) && canDiff
  const diff: CompareResult | null = needsDiff
    ? await fetchAddedLines(installationId, repo, payload.before, payload.after)
    : null

  const confirmed = confirmContentMatches(matches, diff?.addedLines ?? null)
  if (confirmed.length === 0 && !forensics && !diff?.truncated && aiFindings.length === 0) {
    logger.info("alert_dismissed_no_content_match", { repo, sha })
    return
  }

  const changed = filesIn(payload)

  const serious = confirmed.filter(
    (match) => SEVERITY_ORDER.indexOf(match.rule.severity) >= SEVERITY_ORDER.indexOf("high"),
  )
  

  const xray =
    serious.length > 0 ? await analyseChangedJavaScript(installationId, repo, sha, changed) : []

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
    source: "push",
    title: `[${severity}] ${repo}: ${ruleIds.join(", ")}`,
    body: buildBody(
      payload,
      confirmed,
      [...xray, ...aiFindings],
      diff?.truncated ?? false,
      mention,
      forensics,
      target.redactContent,
    ),
    repeat: buildRepeat(payload, forensics, [...xray, ...aiFindings], target.redactContent),
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
  logger.info("push_alert_filed", {
    repo,
    target: target.repo,
    sha,
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

// The files a push touched, in the shape the analyser wants.
function filesIn(payload: PushPayload) {
  const seen = new Map<string, "added" | "modified" | "removed">();
  for (const commit of payload.commits) {
    for (const path of commit.added) seen.set(path, "added");
    for (const path of commit.modified) if (!seen.has(path)) seen.set(path, "modified");
    for (const path of commit.removed) seen.set(path, "removed");
  }
  return [...seen.entries()].map(([path, changeType]) => ({ path, changeType }));
}

// A compare against the empty SHA 404s on GitHub, which is exactly the case on.
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
  extra: ScanFinding[],
  truncated: boolean,
  mention?: string,
  forensics?: ForcePushForensics | null,
  redactContent = false,
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
  ]
  if (matches.length > 0) {
    lines.push(
      "",
      "### Matched rules",
      ...findingsMarkdown(
        matches.map((m) =>
          toFinding(m.rule, payload.repository.full_name, m.matchedFiles, [
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
      ...erasureMarkdown(forensics, payload.repository.full_name, payload.before),
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
  if (payload.before === EMPTY_SHA) {
    lines.push("", "Branch had no previous head, so content rules were reported without diff confirmation.")
  }
  lines.push("", reviewLink(payload))
  return lines.join("\n")
}
