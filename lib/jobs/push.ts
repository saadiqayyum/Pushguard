import { compareTruncatedFinding, processMatches } from "@/lib/alerts"
import { changedFilesOf, changedFilesOfCompare, EMPTY_SHA, fromPush } from "@/lib/change-event"
import { activeInstallation, enqueueJob, mergedViaPullRequest, type InstallationDoc } from "@/lib/db"
import { confirmContentMatches, erasureRules, evaluateRules, needsReviewCheck, type ChangedFile, type PushContext } from "@/lib/engine"
import { toFinding } from "@/lib/finding"
import { inspectForcePush } from "@/lib/forensics"
import { commitReachedViaPullRequest } from "@/lib/github"
import { withGitHubMeter } from "@/lib/github-meter"
import { logger } from "@/lib/logger"
import { actionPinFindings } from "@/lib/pin-check"
import { pushDiffLoader } from "@/lib/push-diff-loader"
import type { PushDiff } from "@/lib/push-diff"
import { tagMovedFinding } from "@/lib/push-signals"
import { pushRules } from "@/lib/rules"
import type { JobMessage } from "@/schemas/job"
import type { PushPayload } from "@/schemas/webhook"
import { queueAiReview } from "./ai-review"
import { noteTagMoved } from "./chain-alert"
import { PUSH_GITHUB_CONCURRENCY, PUSH_PAYLOAD_COMMIT_CAP, REVIEW_DEFER_SECONDS, WEBHOOK_PUSHES_PER_MINUTE } from "./limits"
import { changesDependencies, changesPins, dependencyFindings, detonateIfGated } from "./push-extras"
import { queueFollowUps } from "./push-follow-ups"
import { indicatorFindings, pushIndicators, readsIndicatorLines } from "./push-indicators"
import { codeIntelFindings } from "./push-intel"
import { advancedStage, responseFollowUps, stagedRules, stageNeeds } from "./push-advanced"
import { looksMerged, planPush, reviewDecision } from "./push-plan"

type PushJob = Extract<JobMessage, { type: "push" }>

const FLOOD_FINDING = {
  id: "push-flood",
  severity: "high" as const,
  description: "An unusual burst of pushes arrived from this account",
}

function stageClock() {
  const ms: Record<string, number> = {}
  let last = Date.now()
  return {
    ms,
    lap(stage: string) {
      ms[stage] = Date.now() - last
      last = Date.now()
    },
  }
}

export async function evaluatePush(job: PushJob): Promise<void> {
  const installation = await activeInstallation(job.payload.repository.owner.login)
  if (!installation) return
  const started = Date.now()
  await withGitHubMeter(PUSH_GITHUB_CONCURRENCY, async (meter) => {
    const clock = stageClock()
    const outcome = await runPush(job, installation, clock.lap)
    logger.info("push_timing", {
      deliveryId: job.deliveryId,
      repo: job.payload.repository.full_name,
      outcome,
      stages: clock.ms,
      totalMs: Date.now() - started,
      githubCalls: meter.calls,
    })
  })
}

async function runPush(job: PushJob, installation: InstallationDoc, lap: (stage: string) => void): Promise<string> {
  const { payload, deliveryId, senderFirstPush, flood } = job
  const repo = payload.repository.full_name
  const branch = payload.ref.replace("refs/heads/", "")
  const { installationId } = installation

  const [{ active: rules, shadow }, indicators] = await Promise.all([pushRules(installation.org), pushIndicators(payload)])
  const staged = payload.deleted ? [] : stagedRules(rules, shadow)
  const reviewCheck = !payload.deleted && needsReviewCheck(rules, repo, branch)
  const review = reviewCheck
    ? reviewDecision({
        stored: await mergedViaPullRequest(repo, payload.after),
        deferred: job.reviewDeferred === true,
        looksMerged: looksMerged(payload.commits.at(-1)?.message),
      })
    : null
  if (review === "defer") {
    await enqueueJob({ ...job, reviewDeferred: true }, REVIEW_DEFER_SECONDS)
    logger.info("push_deferred_for_merge", { deliveryId, repo, after: payload.after })
    return "deferred"
  }
  lap("sync")

  const base = payload.before === EMPTY_SHA ? payload.repository.default_branch : payload.before
  const loadDiff = base && !payload.deleted ? pushDiffLoader(installationId, repo, base, payload.after) : null
  const commitsCapped = payload.commits.length >= PUSH_PAYLOAD_COMMIT_CAP && payload.before !== EMPTY_SHA && !payload.deleted
  const [files, truncated] = commitsCapped && loadDiff ? await comparedFiles(loadDiff) : [changedFilesOf(payload), false]
  const onDefault = !payload.deleted && branch === payload.repository.default_branch
  const canDiff = !payload.deleted && payload.before !== EMPTY_SHA
  const preliminary = evaluateRules(rules, toContext(payload, files, senderFirstPush, null))
  const plan = planPush({
    canCompare: loadDiff !== null,
    commitsCapped,
    contentRules: canDiff && (preliminary.some((m) => m.needsDiff) || stageNeeds(staged).lines),
    indicatorLines: readsIndicatorLines(indicators, payload, installation.indicatorBranches),
    pins: changesPins(payload, files),
    dependencies: changesDependencies(payload, files),
    intel: onDefault && canDiff && files.some((f) => f.changeType !== "removed"),
    forensics: payload.forced && canDiff && erasureRules(rules).length > 0,
  })
  const diff = plan.compare ? loadDiff : null

  const [unreviewed, forensics] = await Promise.all([
    review === "ask_github" ? reviewState(installationId, repo, payload.after) : review === "reviewed" ? false : null,
    plan.forensics && diff ? inspectForcePush(installationId, repo, payload.before, payload.after, rules, branch, diff) : null,
    diff?.(),
  ])
  lap("fetch")

  const context = toContext(payload, files, senderFirstPush, unreviewed)
  const matches = evaluateRules(rules, context)
  const loaded = diff ? await diff() : null
  const tagMoved = tagMovedFinding(payload)
  const [intel, dependencies, indicatorHits, pins] = await Promise.all([
    onDefault ? codeIntelFindings(installationId, payload, files, senderFirstPush, loaded) : { findings: [], paths: [] },
    plan.dependencies && loaded ? dependencyFindings(installationId, payload, loaded) : { findings: [], signals: [] },
    indicatorFindings(indicators, payload, files, plan.indicatorLines ? diff : null),
    plan.pins && loaded ? actionPinFindings(installationId, repo, loaded.files) : [],
    tagMoved ? noteTagMoved(installation.org, repo, tagMoved.lines[0] ?? payload.ref) : null,
  ])
  const confirmed = confirmContentMatches(matches, loaded?.addedLines ?? null)
  const fired = [
    ...confirmed.map((m) => m.rule.id),
    ...[...dependencies.findings, ...pins, ...indicatorHits.findings, ...intel.findings, ...(tagMoved ? [tagMoved] : [])].map((f) => f.ruleId),
  ]
  const advanced = await advancedStage({
    staged,
    matched: payload.deleted ? [] : confirmed,
    payload,
    context,
    diff: loaded,
    rules: [...new Set(fired)],
    paths: intel.paths,
    indicators: indicatorHits.hits,
    onDefault,
  }).catch((error: unknown) => {
    logger.warn("advanced_rules_unavailable", { repo, error: error instanceof Error ? error.message : String(error) })
    return { findings: [], plan: null }
  })
  lap("analyse")

  logger.info("push_evaluated", { deliveryId, repo, branch, sender: payload.sender.login, rules: rules.length, matches: matches.map((m) => m.rule.id) })
  const extra = [
    ...(flood
      ? [toFinding(FLOOD_FINDING, repo, [], [`More than ${WEBHOOK_PUSHES_PER_MINUTE} pushes reached this installation within a minute. Each was still evaluated.`], { prose: true })]
      : []),
    ...(truncated ? [compareTruncatedFinding(repo)] : []),
    ...(tagMoved ? [tagMoved] : []),
    ...dependencies.findings,
    ...pins,
    ...indicatorHits.findings,
    ...intel.findings,
    ...advanced.findings,
  ]
  const event = { ...fromPush(payload), files }
  const filed =
    matches.length === 0 && !forensics && extra.length === 0
      ? null
      : await processMatches(installation, event, matches, forensics, extra, loadDiff ?? undefined)
  lap("file")

  await detonateIfGated(installation, payload, matches, dependencies.signals, advanced.plan?.detonate ?? null)
  await responseFollowUps(installation, payload, advanced.plan, filed)
  if (!payload.deleted) await queueAiReview(installation, event, context, filed)
  if (onDefault) await queueFollowUps(installation, payload, context)
  lap("follow_ups")
  return filed ? "filed" : "clean"
}

// A payload lists at most 20 commits, so a longer push reads its files from compare.
async function comparedFiles(loadDiff: () => Promise<PushDiff>): Promise<[ChangedFile[], boolean]> {
  const diff = await loadDiff()
  return [changedFilesOfCompare(diff.files), diff.filesCapped]
}

// Null, not false, when GitHub could not answer. See commitReachedViaPullRequest.
async function reviewState(installationId: number, repo: string, sha: string): Promise<boolean | null> {
  const viaPr = await commitReachedViaPullRequest(installationId, repo, sha)
  return viaPr === null ? null : !viaPr
}

function toContext(payload: PushPayload, files: ChangedFile[], senderFirstPush: boolean, unreviewed: boolean | null): PushContext {
  return {
    event: "push",
    repo: payload.repository.full_name,
    branch: payload.ref.replace("refs/heads/", ""),
    forced: payload.forced,
    senderFirstPush,
    branchCreated: payload.created,
    branchDeleted: payload.deleted,
    authorMismatch: payload.commits.some((commit) => commit.author?.username && commit.author.username !== payload.sender.login),
    unreviewed,
    hourUtc: new Date().getUTCHours(),
    files,
    commitMessages: payload.commits.map((commit) => commit.message).filter(Boolean),
  }
}
