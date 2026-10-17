import { and, eq, inArray, lt } from "drizzle-orm"
import { integer, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import { DAY_MS } from "@/lib/code-intel/limits"
import { app, q, systemAccess } from "./client"
import { MAX_MERGED_COMMIT_PRUNE, MERGED_COMMIT_RETENTION_DAYS } from "./limits"

// Commits that landed through a merged pull request: its merge commit and its
// head. Written by the pull_request webhook, read by the push job's reviewed check.
export const mergedCommits = app
  .table(
    "merged_commits",
    {
      repo: text().notNull(),
      sha: text().notNull(),
      number: integer().notNull(),
      mergedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [systemAccess("merged_commits"), primaryKey({ columns: [t.repo, t.sha] })],
  )
  .enableRLS()

export async function recordMergedPullRequest(repo: string, number: number, shas: string[]): Promise<void> {
  const now = new Date()
  const rows = [...new Set(shas.map((s) => s.toLowerCase()))].map((sha) => ({ repo, sha, number, mergedAt: now }))
  if (rows.length === 0) return
  await q(async (tx) => {
    await tx.insert(mergedCommits).values(rows).onConflictDoNothing()
    const cutoff = new Date(now.getTime() - MERGED_COMMIT_RETENTION_DAYS * DAY_MS)
    const expired = tx
      .select({ sha: mergedCommits.sha })
      .from(mergedCommits)
      .where(and(eq(mergedCommits.repo, repo), lt(mergedCommits.mergedAt, cutoff)))
      .limit(MAX_MERGED_COMMIT_PRUNE)
    await tx.delete(mergedCommits).where(and(eq(mergedCommits.repo, repo), inArray(mergedCommits.sha, expired)))
  })
}

export async function mergedViaPullRequest(repo: string, sha: string): Promise<boolean> {
  const rows = await q((tx) =>
    tx
      .select({ number: mergedCommits.number })
      .from(mergedCommits)
      .where(and(eq(mergedCommits.repo, repo), eq(mergedCommits.sha, sha.toLowerCase())))
      .limit(1),
  )
  return rows.length > 0
}
