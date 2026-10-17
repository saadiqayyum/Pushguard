import {
  appendSessionFindings,
  claimReviewSession,
  enqueueJob,
  finishRule,
  installationById,
  repoRecord,
  reviewSession,
  setReviewSessionStatus,
  upsertQueuedSession,
  type InstallationDoc,
  type ReviewSessionDoc,
} from "@/lib/db"
import { getActiveAiRules } from "@/lib/ai-rules"
import type { AiRule } from "@/schemas/ai-rule"
import { findingsMarkdown, toFinding, topSeverity } from "@/lib/finding"
import { fileOrThreadAlert } from "@/lib/alerts"
import { resolveAlertTarget } from "@/lib/alert-target"
import { logger } from "@/lib/logger"
import { orientSession } from "@/lib/review-orientation"
import { runRule } from "@/lib/review-rule"
import { SOURCE_FILE } from "@/lib/source-files"
import { matchesWhen, runsOn } from "@/lib/engine"
import type { ChangedFile, PushContext } from "@/lib/engine"

// One job's share. A session that does not finish pauses and its next job
// resumes at the first rule still marked undone.
const RULES_PER_RUN = 2
const SESSION_BUDGET_MS = 45_000
const MAX_SEEDS = 30

const NOT_RUN = {
  id: "ai-rule-did-not-run",
  severity: "high" as const,
  description: "An AI rule could not be answered, so this repository was never reviewed against it",
}

// Queue a whole-repository review. Never runs inline: a tree walk plus an agent
// loop does not fit in the job that discovered the push.
export async function enqueueReviewSession(input: {
  org: string
  installationId: number
  repo: string
  branch: string
  sha: string
  source: ReviewSessionDoc["source"]
  pullRequest?: ReviewSessionDoc["pullRequest"]
  rules: ReviewSessionDoc["rules"]
  seeds: string[]
  baseSha?: string
}): Promise<void> {
  if (input.rules.length === 0) return
  const id = await upsertQueuedSession({ ...input, seeds: input.seeds.slice(0, MAX_SEEDS) })
  await enqueueJob({ type: "review_session", id })
  logger.info("review_session_queued", { repo: input.repo, rules: input.rules.length })
}

// What a session keeps of a rule. A scan passes the key it chose to spend.
export function sessionRule(rule: AiRule, key: string | undefined): ReviewSessionDoc["rules"][number] {
  return {
    id: rule.id,
    prompt: rule.prompt,
    severity: rule.severity,
    paths: rule.paths,
    exclude_paths: rule.exclude_paths,
    budget: rule.budget,
    key,
    model: rule.model,
    effort: rule.effort,
    max_output_tokens: rule.max_output_tokens,
    thinking_budget: rule.thinking_budget,
    timeout_ms: rule.timeout_ms,
    max_input_tokens: rule.max_input_tokens,
    done: false,
  }
}

// Which rules want a whole-repository review of this push, and what to start from.
export async function queueRepositoryRules(
  installation: InstallationDoc,
  repo: string,
  branch: string,
  sha: string,
  changed: ChangedFile[],
  baseSha?: string,
  context?: PushContext,
  pullRequest?: ReviewSessionDoc["pullRequest"],
): Promise<void> {
  const all = await getActiveAiRules(installation.org)
  const wanted = all.filter(
    (rule) =>
      rule.scope === "repository" &&
      runsOn(rule, context ?? {}) &&
      (!rule.when || (context !== undefined && matchesWhen(rule.when, context))),
  )
  if (wanted.length === 0) return

  const seeds = changed
    .filter((file) => file.changeType !== "removed" && SOURCE_FILE.test(file.path))
    .map((file) => file.path)

  await enqueueReviewSession({
    org: installation.org,
    installationId: installation.installationId,
    repo,
    branch,
    sha,
    source: pullRequest ? "pull_request" : "push",
    pullRequest,
    baseSha,
    rules: wanted.map((rule) => sessionRule(rule, rule.key)),
    seeds,
  })
}

// Work one session. Returns false when it stopped with rules still undone.
async function runSession(session: ReviewSessionDoc): Promise<boolean> {
  const installation = await installationById(session.installationId)
  if (!installation) return true

  const { orientation, blindSpots } = await orientSession(session)
  await appendSessionFindings(session.id, blindSpots)

  const deadline = AbortSignal.timeout(SESSION_BUDGET_MS)
  const pending = session.rules.filter((rule) => !rule.done)
  let ran = 0

  for (const rule of pending.slice(0, RULES_PER_RUN)) {
    if (deadline.aborted) break
    const findings = await runRule(session, installation, rule, orientation, deadline)
    ran++

    await finishRule(
      session.id,
      rule.id,
      findings ?? [
        toFinding(NOT_RUN, session.repo, [], [`Rule \`${rule.id}\` could not be answered for this repository.`], {
          prose: true,
        }),
      ],
    )
  }

  return pending.length - ran <= 0
}

// One slice of a session. Unfinished, it pauses and queues itself again; a
// failure is rethrown so the queue retries it, and exhaustion is the queue's call.
export async function advanceReviewSession(id: string): Promise<void> {
  const session = await claimReviewSession(id)
  if (!session) return
  try {
    if (!(await runSession(session))) {
      await setReviewSessionStatus(id, { status: "paused" })
      await enqueueJob({ type: "review_session", id })
      return
    }
    await setReviewSessionStatus(id, { status: "done", finishedAt: new Date() })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await setReviewSessionStatus(id, { status: "paused", error: message })
    throw error
  }
  await fileSessionFindings(id)
}

// A finished session files one alert, the same way a scan does.
async function fileSessionFindings(id: string): Promise<void> {
  const session = await reviewSession(id)
  if (!session || session.findings.length === 0) return

  const stored = await repoRecord(session.repo)
  const target = resolveAlertTarget(session.repo, stored?.private ?? false)
  const severity = topSeverity(session.findings.map((f) => f.severity))
  const ruleIds = [...new Set(session.findings.map((f) => f.ruleId))]

  await fileOrThreadAlert({
    installationId: session.installationId,
    target: target.repo,
    severity,
    ruleIds,
    findings: session.findings,
    source: session.source,
    ...(session.pullRequest ? { pullRequest: session.pullRequest } : {}),
    title: `[${severity}] ${session.repo}: ${ruleIds.join(", ")}`,
    body: [
      `Whole-repository review of \`${session.repo}\` at \`${session.sha.slice(0, 7)}\`.`,
      "",
      "### Findings",
      ...findingsMarkdown(session.findings, target.redactContent),
    ].join("\n"),
    repeat: `Reviewed again at \`${session.sha.slice(0, 7)}\`.`,
  })
  logger.info("review_session_filed", { repo: session.repo, findings: session.findings.length })
}
