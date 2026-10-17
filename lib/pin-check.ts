import { freshVerdict, isWorkflowFile, pinChanges, reachabilityOf, type ActionRef } from "@/lib/action-pins"
import {
  MAX_ACTION_TAG_PAGES,
  MAX_PINS_CHECKED_PER_CHANGE,
  PIN_REACHABLE_TTL_HOURS,
  PIN_UNREACHABLE_TTL_HOURS,
  TAGS_PER_PAGE,
} from "@/lib/ci-limits"
import { cachedPinVerdict, recordPinVerdict, type ScanFinding } from "@/lib/db"
import { patchLines } from "@/lib/diff-lines"
import { AppError } from "@/lib/errors"
import { toFinding } from "@/lib/finding"
import type { CompareFile } from "@/lib/github"
import { compareStatus, listTags, repoDefaultBranch } from "@/lib/github-refs"
import { logger } from "@/lib/logger"

const IMPOSTER = {
  id: "action-pin-imposter",
  severity: "critical" as const,
  description: "A workflow pins an action to a commit that is on none of its branches or tags",
}
const DOWNGRADED = {
  id: "action-pin-downgraded",
  severity: "high" as const,
  description: "A workflow replaced a commit-SHA action pin with a movable tag or branch",
}
const NOT_CHECKED = {
  id: "action-pins-not-checked",
  severity: "medium" as const,
  description: "Some changed action pins could not be checked",
}

type Verdict = "reachable" | "unreachable" | "unknown"

// Pin changes in the workflow files of one diff. GitHub is called only when a
// pinned SHA is new or changed; a diff with no workflow change costs nothing.
export async function actionPinFindings(installationId: number, repo: string, files: CompareFile[]): Promise<ScanFinding[]> {
  const findings: ScanFinding[] = []
  const unchecked: string[] = []
  const checks: { file: string; action: ActionRef }[] = []
  for (const file of files.filter((f) => isWorkflowFile(f.path))) {
    if (file.patch === undefined) {
      if (file.additions + file.deletions > 0) unchecked.push(`${file.path}: GitHub returned no diff for this file.`)
      continue
    }
    const { added, removed } = patchLines(file.patch)
    const changes = pinChanges(removed, added)
    checks.push(...changes.checks.map((action) => ({ file: file.path, action })))
    for (const { from, to } of changes.downgrades) {
      findings.push(toFinding(DOWNGRADED, repo, [file.path], [`${to.repo}${to.path} went from @${from.ref.slice(0, 12)} to @${to.ref}.`]))
    }
  }
  if (checks.length > MAX_PINS_CHECKED_PER_CHANGE) {
    unchecked.push(`${checks.length - MAX_PINS_CHECKED_PER_CHANGE} pins past the ${MAX_PINS_CHECKED_PER_CHANGE}-per-change cap.`)
  }
  const checked = checks.slice(0, MAX_PINS_CHECKED_PER_CHANGE)
  const verdicts = await Promise.all(checked.map(({ action }) => pinVerdict(installationId, action)))
  for (const [i, { file, action }] of checked.entries()) {
    const verdict = verdicts[i]
    if (verdict === "unreachable") {
      findings.push(
        toFinding(IMPOSTER, repo, [file], [
          `${action.repo}${action.path}@${action.ref} is not reachable from the default branch or any recent tag of ${action.repo}: a fork or off-branch commit.`,
        ]),
      )
    } else if (verdict === "unknown") {
      unchecked.push(`${action.repo}@${action.ref.slice(0, 12)}: ${action.repo} could not be read.`)
    }
  }
  if (unchecked.length > 0) findings.push(toFinding(NOT_CHECKED, repo, [], unchecked))
  return findings
}

// Concurrency is held by the caller's GitHub meter; a cached verdict costs no call.
async function pinVerdict(installationId: number, action: ActionRef): Promise<Verdict> {
  const ttl = { reachable: PIN_REACHABLE_TTL_HOURS, unreachable: PIN_UNREACHABLE_TTL_HOURS }
  const cached = freshVerdict(await cachedPinVerdict(action.repo, action.ref), new Date(), ttl)
  if (cached) return cached
  try {
    const base = await repoDefaultBranch(installationId, action.repo)
    if (!base) return "unknown"
    const status = await compareStatus(installationId, action.repo, base, action.ref)
    let verdict = reachabilityOf(status, false)
    if (verdict !== "reachable") {
      const { tags } = await listTags(installationId, action.repo, MAX_ACTION_TAG_PAGES * TAGS_PER_PAGE)
      verdict = reachabilityOf(status, tags.some((t) => t.sha.toLowerCase() === action.ref.toLowerCase()))
    }
    await recordPinVerdict(action.repo, action.ref, verdict === "reachable")
    return verdict
  } catch (error) {
    if (error instanceof AppError && error.code === "rate_limited") throw error
    logger.warn("action_pin_check_failed", { action: action.repo, sha: action.ref, error: String(error) })
    return "unknown"
  }
}
