import { confirmContentMatches, erasedLines, erasureRules, evaluateRules, type PushContext } from "@/lib/engine"
import { toFinding, type ForcePushForensics } from "@/lib/finding"
import { fetchAddedLines, fetchErasedHistory } from "@/lib/github"
import { logger } from "@/lib/logger"
import type { Rule } from "@/schemas/rule"

// How many erased commits are worth naming in an issue before it becomes a wall.
const MAX_LISTED_COMMITS = 10

// Read the side of a force push that no snapshot can see.
// A force push is the one event that removes evidence rather than adding it.
export async function inspectForcePush(
  installationId: number,
  repo: string,
  before: string,
  after: string,
  rules: Rule[],
  branch: string,
): Promise<ForcePushForensics | null> {
  const applicable = erasureRules(rules)
  if (applicable.length === 0) return null

  try {
    const orphaned = await fetchErasedHistory(installationId, repo, before, after)
    if (!orphaned) return null

    const surviving = await fetchAddedLines(installationId, repo, before, after)
    const gone = erasedLines(orphaned.addedLines, surviving.addedLines)
    if (gone.length === 0) {
      logger.info("force_push_no_erased_content", { repo, before, after })
      return null
    }

    const context: PushContext = {
      repo,
      branch,
      forced: true,
      senderFirstPush: false,
      branchCreated: false,
      branchDeleted: false,
      authorMismatch: false,
      unreviewed: null,
      hourUtc: new Date().getUTCHours(),
      files: orphaned.files,
      commitMessages: [],
    }

    const confirmed = confirmContentMatches(evaluateRules(applicable, context), gone)
    if (confirmed.length === 0) return null

    const findings = confirmed.map((match) =>
      toFinding(match.rule, repo, match.matchedFiles, match.matchedLines),
    )

    logger.info("force_push_erasure_detected", {
      repo,
      before,
      after,
      erasedCommits: orphaned.commits.length,
      rules: findings.map((finding) => finding.ruleId),
    })

    return {
      erasedCommits: orphaned.commits.slice(0, MAX_LISTED_COMMITS),
      erasedCommitCount: orphaned.commits.length,
      erasedFiles: [...new Set(confirmed.flatMap((match) => match.matchedFiles))],
      findings,
      mergeBase: orphaned.mergeBase,
      truncated: orphaned.truncated || surviving.truncated,
    }
  } catch (error) {
    logger.warn("force_push_inspection_failed", {
      repo,
      before,
      after,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
