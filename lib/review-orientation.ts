import { ensureIndexed } from "@/lib/code-index"
import { indexedFileCount, type ReviewSessionDoc, type ScanFinding } from "@/lib/db"
import { toFinding } from "@/lib/finding"
import { logger } from "@/lib/logger"
import { renderDiffContext } from "@/lib/diff-context"
import { fetchCompareFiles, fetchDependencyChanges } from "@/lib/github"

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

// Indexes first, since find_references answers from it, then renders the diff so
// the agent does not spend budget re-deriving it. Partial reads are findings.
export async function orientSession(
  session: ReviewSessionDoc,
): Promise<{ orientation: string; blindSpots: ScanFinding[] }> {
  const { complete } = await ensureIndexed(session.repo, session.installationId, session.sha)
  const blindSpots: ScanFinding[] = []
  if (!complete) {
    const covered = await indexedFileCount(session.repo)
    logger.info("review_session_partial_index", { repo: session.repo, files: covered })
    blindSpots.push(
      toFinding(PARTIAL_INDEX, session.repo, [], [
        `${covered} files indexed so far; find_references may under-report until indexing finishes.`,
      ], { prose: true }),
    )
  }

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
  return { orientation, blindSpots }
}
