import { confirmContentMatches, erasedLines, erasureRules, evaluateRules, type PushContext } from "@/lib/engine"
import { toFinding, type ForcePushForensics } from "@/lib/finding"
import { fetchAddedLines, fetchErasedHistory } from "@/lib/github"
import { logger } from "@/lib/logger"
import type { Rule } from "@/schemas/rule"

/** How many erased commits are worth naming in an issue before it becomes a wall. */
const MAX_LISTED_COMMITS = 10

/**
 * Read the side of a force push that no snapshot can see.
 *
 * A force push is the one event that removes evidence rather than adding it.
 * Every scanner on the market reads a checkout, and a checkout only ever has
 * the surviving side, so a secret that was committed and then force-pushed away
 * is invisible to all of them while still being fully leaked: it sat on
 * github.com, it is in anyone's existing clone, and it is in the reflog of
 * every machine that fetched. This is the one thing being webhook-driven buys
 * that being checkout-driven cannot.
 *
 * Two compares, in opposite directions. The orphaned side supplies the
 * candidates, the surviving side supplies the exclusions, and rules are run
 * against the difference so a routine rebase, which leaves identical content on
 * both sides, produces nothing at all.
 *
 * Returns null when there is nothing to say: no rewrite happened, the caller's
 * rules cannot speak about erased content, or the orphaned commit is already
 * gone. Never throws. It runs after the response has been sent, and a failure
 * to read the erased side must not take the alert for the visible push with it.
 */
export async function inspectForcePush(
  installationId: number,
  repo: string,
  before: string,
  after: string,
  rules: Rule[],
  branch: string,
): Promise<ForcePushForensics | null> {
  const applicable = erasureRules(rules)
  // No content rule means no question we could ask of the erased side. Skip
  // before spending two GitHub calls on an answer nobody can use.
  if (applicable.length === 0) return null

  try {
    const orphaned = await fetchErasedHistory(installationId, repo, before, after)
    if (!orphaned) return null

    // ponytail: second compare of the same range processMatches may also fetch.
    // One extra call, only on forced pushes carrying content rules. Thread the
    // diff through from the caller if force pushes ever get hot enough to care.
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
      // The orphaned side is a diff, not a push event. `erasureRules` has
      // already dropped every rule that would ask about one, so these are
      // recorded honestly rather than guessed at.
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
    // The usual cause is a 404: GitHub collected the orphaned commit before we
    // asked for it. Nothing to recover, and nothing worth failing the alert
    // over.
    logger.warn("force_push_inspection_failed", {
      repo,
      before,
      after,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
