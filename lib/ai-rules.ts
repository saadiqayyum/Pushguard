import { contextPaths, filesForRule, fitToBudget, MAX_TOTAL_CHARS } from "@/lib/ai-rule-scope"
import { compact } from "@/lib/compact"
import { aiCredentials } from "@/lib/ai"
import { toFinding } from "@/lib/finding"
import { fetchBlobs } from "@/lib/github"
import { logger } from "@/lib/logger"
import { runReview } from "@/lib/review-graph"
import { aiRuleSchema, type AiRule } from "@/schemas/ai-rule"
import type { ChangedFile, PushContext } from "@/lib/engine"
import type { InstallationDoc, ScanFinding } from "@/lib/db"
import { db, claimAiReview } from "@/lib/db"
import { MAX_AI_REVIEWS_PER_DAY } from "@/schemas/ai-rule"

// Rules a model answers, run on their own terms.

// How many rules one push may pay for.
const MAX_RULES_PER_PUSH = 10

// Wall clock for every rule on this push, together.
const AI_PASS_BUDGET_MS = 40_000

// A rule that could not be answered, reported like any other finding.
// The pattern engine already does this for a diff it could not finish reading:
const NOT_RUN_FINDING = {
  id: "ai-rule-did-not-run",
  severity: "high" as const,
  description: "An AI rule could not be answered, so this push was never reviewed against it",
}

export async function getActiveAiRules(owner: string): Promise<AiRule[]> {
  const docs = await db.aiRules().find({ owner, enabled: true }).toArray()
  const parsed: AiRule[] = []
  for (const doc of docs) {
    const result = aiRuleSchema.safeParse(doc.body)
    if (result.success) parsed.push(result.data)
    else logger.warn("ai_rule_skipped_invalid", { ruleId: doc.ruleId })
  }
  return parsed
}

// Run every AI rule that this push gives something to read.
export async function runAiRules(
  installation: InstallationDoc,
  repo: string,
  branch: string,
  sha: string,
  changed: ChangedFile[],
  context?: PushContext,
  // A scan names the key it is willing to spend. It wins over each rule's own,
  // because the person starting the scan chose what this run should cost.
  keyOverride?: string,
): Promise<ScanFinding[]> {
  const all = await getActiveAiRules(installation.installedBy)
  if (all.length === 0) return []

  // `repository` rules navigate the whole tree through tools and run as their
  // own background session, so they must not also run here: they would be paid
  // for twice and answered against the wrong file set.
  const scoped = all
    .filter((rule) => rule.scope === "changed")
    .map((rule) => ({ rule, paths: filesForRule(rule, repo, branch, changed, context) }))
    .filter((entry) => entry.paths.length > 0)
  if (scoped.length === 0) return []

  const rules = scoped.slice(0, MAX_RULES_PER_PUSH)
  const findings: ScanFinding[] = []
  const compaction = { saved: 0, truncated: 0 }
  const deadline = AbortSignal.timeout(AI_PASS_BUDGET_MS)
  let reached = 0

  const sources = new Map<string, string | null>()
  // One request per rule, not one per file. Paths another rule already pulled
  // are skipped, so overlapping rules cost nothing extra.
  const prime = async (paths: string[]): Promise<void> => {
    const missing = paths.filter((path) => !sources.has(path))
    if (missing.length === 0) return
    const { files } = await fetchBlobs(installation.installationId, repo, sha, missing)
    for (const path of missing) sources.set(path, files.get(path) ?? null)
  }

  for (const { rule, paths } of rules) {
    if (deadline.aborted) break
    reached++

    const credentials = aiCredentials(installation, keyOverride ?? rule.key)
    if (!credentials) {
      logger.info("ai_rule_skipped_no_key", { rule: rule.id })
      continue
    }

    const documents: Record<string, string> = {}
    let budget = MAX_TOTAL_CHARS
    try {
      await prime(paths)
    } catch (error) {
      logger.warn("ai_rule_fetch_failed", { rule: rule.id, error: String(error) })
    }
    for (const path of paths) {
      if (budget <= 0 || deadline.aborted) break
      try {
        const source = sources.get(path) ?? null
        if (!source) continue
        const { text, saved, truncated } = compact(source)
        if (saved > 0 || truncated > 0) {
          compaction.saved += saved
          compaction.truncated += truncated
        }
        const body = fitToBudget(text, budget)
        if (body === "") break
        budget -= body.length
        documents[path] = body
      } catch (error) {
        logger.warn("ai_rule_fetch_failed", { rule: rule.id, path, error: String(error) })
      }
    }
    if (Object.keys(documents).length === 0) continue

    if (!(await claimAiReview(installation.installedBy, MAX_AI_REVIEWS_PER_DAY))) {
      logger.warn("ai_daily_cap_reached", { owner: installation.installedBy, repo, rule: rule.id })
      findings.push(
        toFinding(NOT_RUN_FINDING, repo, [], [
          `This account has used its ${MAX_AI_REVIEWS_PER_DAY} model reviews for today.`,
        ], { prose: true }),
      )
      reached--
      break
    }

    const others = changed.map((file) => file.path).filter((path) => !(path in documents))
    const verdicts = await runReview(
      credentials,
      documents,
      contextPaths(others),
      rule.prompt,
      deadline,
    )

    if (verdicts === null) {
      findings.push(
        toFinding(NOT_RUN_FINDING, repo, Object.keys(documents), [
          `Rule \`${rule.id}\` was not answered by ${credentials.provider}/${credentials.model}. If this keeps happening, narrow the rule's paths so it sends less, or use a faster model.`,
        ], { prose: true }),
      )
      continue
    }

    for (const verdict of verdicts) {
      findings.push(
        toFinding(
          { id: rule.id, severity: rule.severity, description: rule.description },
          repo,
          [verdict.path],
          [verdict.summary],
          { prose: true },
        ),
      )
    }
    logger.info("ai_rule_ran", {
      rule: rule.id,
      files: Object.keys(documents).length,
      found: verdicts.length,
      key: credentials.label,
      charsSaved: compaction.saved,
      linesTruncated: compaction.truncated,
    })
  }

  const unrun = [
    ...rules.slice(reached).map((entry) => entry.rule.id),
    ...scoped.slice(MAX_RULES_PER_PUSH).map((entry) => entry.rule.id),
  ]
  if (unrun.length > 0) {
    logger.warn("ai_rules_unrun", {
      repo,
      ran: reached,
      unrun: unrun.length,
      outOfTime: deadline.aborted,
    })
    findings.push(
      toFinding(NOT_RUN_FINDING, repo, [], [
        `${unrun.length} AI rule${unrun.length === 1 ? "" : "s"} matched this push but did not run${deadline.aborted ? `: the ${AI_PASS_BUDGET_MS / 1000}s review budget for one push was spent` : `: at most ${MAX_RULES_PER_PUSH} rules run per push`}. Not run: ${unrun.join(", ")}.`,
      ], { prose: true }),
    )
  }

  return findings
}
