import { reachabilityOf } from "@/lib/action-pins"
import { MAX_MOVED_GROUPS_CHECKED, MAX_TAGS_NAMED, MAX_TAGS_SNAPSHOT } from "@/lib/ci-limits"
import { activeInstallation, repoRecord, saveTags, storedTags, type ScanFinding } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { ownerOf, toFinding } from "@/lib/finding"
import { fileFindingOnce, fileFindingsAlert } from "@/lib/findings-alert"
import { compareStatus, listTags } from "@/lib/github-refs"
import { logger } from "@/lib/logger"
import { TAG_MOVED } from "@/lib/push-signals"
import { diffTags, isRoutineRelease, type TagMoveGroup } from "@/lib/tag-diff"
import type { JobMessage } from "@/schemas/job"
import { noteTagMoved } from "./chain-alert"

const TAGS_UNWATCHED = {
  id: "tags-not-fully-watched",
  severity: "low" as const,
  description: "This repository has more tags than Pushguard snapshots",
}

// Compares the live tag map with the stored one. The new map is stored only
// after the alert is filed, so a failed filing is retried, not forgotten.
export async function snapshotTags({ repo }: Extract<JobMessage, { type: "tag_snapshot" }>): Promise<void> {
  const installation = await activeInstallation(ownerOf(repo))
  if (!installation) return
  let listed
  try {
    listed = await listTags(installation.installationId, repo, MAX_TAGS_SNAPSHOT)
  } catch (error) {
    if (!(error instanceof AppError && error.code === "not_found")) throw error
    logger.info("tag_snapshot_repo_gone", { repo })
    return
  }
  const stored = await storedTags(repo)
  const { first, groups } = diffTags(stored, listed.tags)
  if (groups.length > 0) {
    const base = (await repoRecord(repo))?.defaultBranch ?? "main"
    const findings: ScanFinding[] = []
    for (const [index, group] of groups.entries()) {
      const status = index < MAX_MOVED_GROUPS_CHECKED ? await compareStatus(installation.installationId, repo, base, group.sha) : undefined
      if (status !== undefined && reachabilityOf(status, false) === "reachable" && isRoutineRelease(group, listed.tags, stored)) {
        logger.info("tags_moved_routine_release", { repo, sha: group.sha, tags: group.tags.map((t) => t.tag) })
        continue
      }
      findings.push(toFinding(TAG_MOVED, repo, [], movedLines(group, base, status)))
    }
    await fileFindingsAlert({
      installationId: installation.installationId,
      repo,
      findings,
      source: "push",
      intro: `Tags in \`${repo}\` now point at different commits. GitHub sends no event when more than three tags are pushed at once; this was found by comparing tag snapshots.`,
      repeat: `Tags in \`${repo}\` moved again.`,
    })
    for (const finding of findings) await noteTagMoved(installation.org, repo, finding.lines[0] ?? "")
    if (findings.length > 0) logger.warn("tags_moved", { repo, groups: findings.length })
  }
  if (listed.truncated) {
    await fileFindingOnce(installation.installationId, repo, toFinding(TAGS_UNWATCHED, repo, [], [
      `Only the newest ${MAX_TAGS_SNAPSHOT} tags are compared; a repoint of an older tag would not be seen.`,
    ], { prose: true }), `Tag snapshots for \`${repo}\` are partial.`)
  }
  await saveTags(repo, listed.tags, listed.truncated)
  logger.info("tag_snapshot_saved", { repo, tags: listed.tags.length, first, truncated: listed.truncated })
}

// Undefined status: past the reachability cap, so not checked.
function movedLines(group: TagMoveGroup, base: string, status: string | null | undefined): string[] {
  const sha = group.sha.slice(0, 7)
  const named = group.tags.slice(0, MAX_TAGS_NAMED).map((t) => `${t.tag} (was ${t.from.slice(0, 7)})`).join(", ")
  const more = group.tags.length > MAX_TAGS_NAMED ? ` and ${group.tags.length - MAX_TAGS_NAMED} more` : ""
  const head = group.tags.length === 1 ? `${named} moved to ${sha}.` : `${group.tags.length} tags moved to the same commit ${sha}: ${named}${more}.`
  const where =
    status === undefined
      ? `Whether ${sha} is on ${base} was not checked.`
      : reachabilityOf(status, false) === "reachable"
        ? `${sha} is reachable from ${base}.`
        : `${sha} is not reachable from ${base}: an off-branch commit, likely on no branch at all, which is how tj-actions and Trivy tags were repointed.`
  return [head, where]
}
