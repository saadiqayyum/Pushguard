import { createReactAgent } from "@langchain/langgraph/prebuilt"
import { chatModel } from "@/lib/chat-model"
import { z } from "zod"
import { aiCredentials } from "@/lib/ai"
import { getActiveAiRules } from "@/lib/ai-rules"
import { ensureIndexed, findReferences, indexedFileCount } from "@/lib/code-index"
import { claimAiReview, db, STUCK_AFTER_MS, type InstallationDoc, type ReviewSessionDoc, type ScanFinding } from "@/lib/db"
import { findingsMarkdown, toFinding, topSeverity } from "@/lib/finding"
import { fileOrThreadAlert } from "@/lib/alerts"
import { resolveAlertTarget } from "@/lib/alert-target"
import { logger } from "@/lib/logger"
import { reviewTools } from "@/lib/review-tools"
import { renderDiffContext } from "@/lib/diff-context"
import { fetchBlobs, fetchCompareFiles, fetchDependencyChanges } from "@/lib/github"
import { GROUND_RULES, sanitizeSummary } from "@/lib/review-graph"
import { SOURCE_FILE } from "@/lib/source-files"
import { MAX_AI_REVIEWS_PER_DAY } from "@/schemas/ai-rule"
import { matchesWhen } from "@/lib/engine"
import type { ChangedFile, PushContext } from "@/lib/engine"

// One invocation's share. A session that does not finish stays queued and the
// next tick resumes at the first rule still marked undone.
const RULES_PER_RUN = 2
const SESSION_BUDGET_MS = 45_000
const MAX_SEEDS = 30
const MAX_AGENT_STEPS = 60

const PARTIAL_INDEX = {
  id: "repo-index-incomplete",
  severity: "medium" as const,
  description: "The searchable index of this repository was incomplete when it was reviewed",
}

const PARTIAL_DIFF = {
  id: "diff-not-fully-read",
  severity: "high" as const,
  description: "The diff exceeded the read budget, so part of this range was never scanned",
}

const NOT_RUN = {
  id: "ai-rule-did-not-run",
  severity: "high" as const,
  description: "An AI rule could not be answered, so this repository was never reviewed against it",
}

const verdictSchema = z.object({
  findings: z
    .array(
      z.object({
        path: z.string(),
        risk: z.enum(["low", "medium", "high", "critical"]),
        summary: z.string().max(600),
      }),
    )
    .describe("Only files that are actually malicious. Empty is the common, correct answer."),
})

// Queue a whole-repository review. Never runs inline: a tree walk plus an agent
// loop does not fit in the webhook that discovered the push.
export async function enqueueReviewSession(input: {
  owner: string
  installationId: number
  repo: string
  branch: string
  sha: string
  source: "push" | "scan"
  rules: ReviewSessionDoc["rules"]
  seeds: string[]
  baseSha?: string
}): Promise<void> {
  if (input.rules.length === 0) return
  try {
    await db.reviewSessions().updateOne(
      { repo: input.repo, status: "queued" },
      {
        $set: {
          owner: input.owner,
          installationId: input.installationId,
          branch: input.branch,
          sha: input.sha,
          source: input.source,
          rules: input.rules,
          seeds: input.seeds.slice(0, MAX_SEEDS),
          ...(input.baseSha ? { baseSha: input.baseSha } : {}),
        },
        $setOnInsert: {
          _id: crypto.randomUUID(),
          repo: input.repo,
          findings: [],
          status: "queued" as const,
          attempts: 0,
          createdAt: new Date(),
        },
      },
      { upsert: true },
    )
    logger.info("review_session_queued", { repo: input.repo, rules: input.rules.length })
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error
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
): Promise<void> {
  const all = await getActiveAiRules(installation.installedBy)
  const wanted = all.filter(
    (rule) =>
      rule.scope === "repository" &&
      (!rule.when || (context !== undefined && matchesWhen(rule.when, context))),
  )
  if (wanted.length === 0) return

  const seeds = changed
    .filter((file) => file.changeType !== "removed" && SOURCE_FILE.test(file.path))
    .map((file) => file.path)

  await enqueueReviewSession({
    owner: installation.installedBy,
    installationId: installation.installationId,
    repo,
    branch,
    sha,
    source: "push",
    baseSha,
    rules: wanted.map((rule) => ({
      id: rule.id,
      prompt: rule.prompt,
      severity: rule.severity,
      paths: rule.paths,
      exclude_paths: rule.exclude_paths,
      budget: rule.budget,
      key: rule.key,
      done: false,
    })),
    seeds,
  })
}

// Run one rule as a navigating agent. The model asks for files; the tools decide
// whether it gets them.
async function runRule(
  session: ReviewSessionDoc,
  installation: InstallationDoc,
  rule: ReviewSessionDoc["rules"][number],
  orientation: string,
  deadline: AbortSignal,
): Promise<ScanFinding[] | null> {
  const credentials = aiCredentials(installation, rule.key)
  if (!credentials) {
    logger.info("review_session_no_key", { repo: session.repo, rule: rule.id })
    return null
  }

  // The same daily ceiling the changed-files path claims against, and it matters
  // more here: one navigating run is up to `budget` model round trips, so a
  // session left outside the cap is the loop-and-spend hole reopened on the
  // more expensive path. Claimed once per rule, before any of it is spent.
  if (!(await claimAiReview(session.owner, MAX_AI_REVIEWS_PER_DAY))) {
    logger.warn("review_session_daily_cap", { owner: session.owner, repo: session.repo })
    return null
  }

  const { tools, trace } = reviewTools(
    {
      installationId: session.installationId,
      repo: session.repo,
      sha: session.sha,
      paths: rule.paths,
      exclude_paths: rule.exclude_paths,
      budget: rule.budget,
    },
    {
      readBlob: async (path) => {
        const { files } = await fetchBlobs(session.installationId, session.repo, session.sha, [path])
        return files.get(path) ?? null
      },
      findRefs: (symbol, limit) => findReferences(session.repo, symbol, limit),
    },
  )

  try {
    const llm = chatModel(
      credentials.provider,
      credentials.model,
      { maxTokens: 8000, maxRetries: 1, effort: credentials.effort, baseUrl: credentials.baseUrl },
      credentials.apiKey,
    )

    const agent = createReactAgent({
      llm,
      tools,
      responseFormat: verdictSchema,
      prompt: [
        `You are a security analyst reviewing the repository ${session.repo} at commit ${session.sha}.`,
        GROUND_RULES,
        `Answer this specifically: ${rule.prompt}`,
        "Use read_file to read a file and find_references to see where a name is used. Start from the files listed below, then follow what they import or call. You cannot list the tree, so navigate by reading and by searching for names.",
        `You have about ${rule.budget} tool calls. Spend them on files that could plausibly be malicious rather than reading everything.`,
        "Your verdict is advisory and may only add risk, never clear a repository. Reporting nothing is the common and correct answer.",
        orientation,
      ]
        .filter(Boolean)
        .join("\n\n"),
    })

    const result = await agent.invoke(
      { messages: [{ role: "user", content: "Begin the review." }] },
      { signal: deadline, recursionLimit: MAX_AGENT_STEPS },
    )

    const structured = (result as { structuredResponse?: z.infer<typeof verdictSchema> })
      .structuredResponse
    const findings = (structured?.findings ?? []).map((f) =>
      toFinding(
        { id: rule.id, severity: rule.severity, description: undefined },
        session.repo,
        [f.path],
        [sanitizeSummary(f.summary)],
        { prose: true },
      ),
    )

    // A rule that tried to read outside its own scope is itself a finding: the
    // paths came from files under review, so this is where injection surfaces.
    if (trace.refused.length > 0) {
      findings.push(
        toFinding(
          {
            id: "ai-rule-left-its-scope",
            severity: "medium" as const,
            description: "A model review asked for files outside the rule's own paths",
          },
          session.repo,
          [],
          trace.refused.slice(0, 5).map((r) => `${r.path}: ${r.reason}`),
          { prose: true },
        ),
      )
    }

    if (trace.truncated.length > 0) {
      findings.push(
        toFinding(
          {
            id: "file-not-fully-read",
            severity: "medium" as const,
            description: "A file was too large to show the review in full",
          },
          session.repo,
          trace.truncated,
          ["A rule can only judge what it was shown; these files were cut."],
          { prose: true },
        ),
      )
    }

    logger.info("review_session_rule_done", {
      repo: session.repo,
      rule: rule.id,
      calls: trace.calls,
      reads: trace.reads.length,
      refused: trace.refused.length,
      truncated: trace.truncated.length,
      found: findings.length,
      key: credentials.label,
    })
    return findings
  } catch (error) {
    logger.warn("review_session_rule_failed", {
      repo: session.repo,
      rule: rule.id,
      calls: trace.calls,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

// Work one session. Returns false when it stopped with rules still undone.
async function runSession(session: ReviewSessionDoc): Promise<boolean> {
  const installation = await db.installations().findOne({
    installationId: session.installationId,
    active: true,
  })
  if (!installation) return true

  // The index is what find_references answers from, so it is brought up to date
  // before the agent can ask. Cheap when nothing changed.
  const { complete } = await ensureIndexed(session.repo, session.installationId, session.sha)
  const blindSpots: ScanFinding[] = []
  if (!complete) {
    const covered = await indexedFileCount(session.repo)
    logger.info("review_session_partial_index", { repo: session.repo, files: covered })
    // Reported, not just logged. A partial index answers "not used anywhere"
    // for code that is, and a reviewer has no way to tell that from a clean
    // result. Same reasoning as `diff-not-fully-read` on the pattern path.
    blindSpots.push(
      toFinding(PARTIAL_INDEX, session.repo, [], [
        `${covered} files indexed so far; find_references may under-report until indexing finishes.`,
      ], { prose: true }),
    )
  }

  // The diff, as orientation. Filenames alone tell a review nothing about what
  // changed in them, so it would have to re-derive that by reading, spending
  // tool budget on what one call already knows.
  let orientation = ""
  if (session.baseSha) {
    try {
      const [{ files, truncated }, dependencies] = await Promise.all([
        fetchCompareFiles(session.installationId, session.repo, session.baseSha, session.sha),
        fetchDependencyChanges(session.installationId, session.repo, session.baseSha, session.sha),
      ])
      const context = renderDiffContext(files, dependencies)
      orientation = context.text
      if (truncated || context.truncated) {
        blindSpots.push(
          toFinding(PARTIAL_DIFF, session.repo, [], [
            "The diff for this range was larger than the orientation budget, so part of it was never shown to the review.",
          ], { prose: true }),
        )
      }
      for (const dep of dependencies ?? []) {
        for (const vuln of dep.vulnerabilities) {
          blindSpots.push(
            toFinding(
              {
                id: "dependency-known-advisory",
                severity: vuln.severity === "critical" || vuln.severity === "high" ? "high" : "medium",
                description: "This push adds a dependency with a published advisory",
              },
              session.repo,
              [dep.manifest],
              [`${dep.ecosystem}:${dep.name}@${dep.version} — ${vuln.severity}: ${vuln.summary} [${vuln.advisory}]`],
              { prose: true },
            ),
          )
        }
      }
    } catch (error) {
      logger.warn("review_session_diff_failed", { repo: session.repo, error: String(error) })
    }
  }
  if (orientation === "" && session.seeds.length > 0) {
    orientation = `Files worth starting from:\n${session.seeds.map((p) => `- ${p}`).join("\n")}`
  }

  if (blindSpots.length > 0) {
    await db
      .reviewSessions()
      .updateOne({ _id: session._id }, { $push: { findings: { $each: blindSpots } } })
  }

  const deadline = AbortSignal.timeout(SESSION_BUDGET_MS)
  const pending = session.rules.filter((rule) => !rule.done)
  let ran = 0

  for (const rule of pending.slice(0, RULES_PER_RUN)) {
    if (deadline.aborted) break
    const findings = await runRule(session, installation, rule, orientation, deadline)
    ran++

    await db.reviewSessions().updateOne(
      { _id: session._id, "rules.id": rule.id },
      {
        $set: { "rules.$.done": true },
        $push: {
          findings: {
            $each:
              findings ??
              [
                toFinding(NOT_RUN, session.repo, [], [
                  `Rule \`${rule.id}\` could not be answered for this repository.`,
                ], { prose: true }),
              ],
          },
        },
      },
    )
  }

  return pending.length - ran <= 0
}

// Drain queued sessions. Called from the cron and inline after a push queues one.
export async function drainReviewSessions(limit = 2, repo?: string): Promise<number> {
  const sessions = db.reviewSessions()
  let done = 0

  await sessions.updateMany(
    { status: "running", startedAt: { $lt: new Date(Date.now() - STUCK_AFTER_MS) } },
    { $set: { status: "queued" } },
  )

  for (let i = 0; i < limit; i++) {
    const session = await sessions.findOneAndUpdate(
      { status: "queued", ...(repo ? { repo } : {}) },
      { $set: { status: "running", startedAt: new Date() }, $inc: { attempts: 1 } },
      { sort: { createdAt: 1 }, returnDocument: "after" },
    )
    if (!session) break

    try {
      const finished = await runSession(session)
      await sessions.updateOne(
        { _id: session._id },
        finished
          ? { $set: { status: "done", finishedAt: new Date() } }
          : { $set: { status: "queued" } },
      )
      done++
      if (finished) await fileSessionFindings(session._id)
      else break
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await sessions.updateOne(
        { _id: session._id },
        { $set: { status: session.attempts >= 3 ? "failed" : "queued", error: message } },
      )
      logger.warn("review_session_failed", { repo: session.repo, error: message })
    }
  }
  return done
}

// A finished session files one alert, the same way a scan does.
async function fileSessionFindings(id: string): Promise<void> {
  const session = await db.reviewSessions().findOne({ _id: id })
  if (!session || session.findings.length === 0) return

  const stored = await db.repos().findOne({ _id: session.repo })
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
