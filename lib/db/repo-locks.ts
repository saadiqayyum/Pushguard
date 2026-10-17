import { and, eq, lt, or, sql } from "drizzle-orm"
import { text, timestamp } from "drizzle-orm/pg-core"
import { app, q, systemAccess } from "./client"

// One job per repository at a time. A row with a lease, not an advisory lock:
// Supavisor's transaction pooling cannot hold a session lock across statements.
export const repoLocks = app
  .table(
    "repo_locks",
    {
      repo: text().primaryKey(),
      holder: text().notNull(),
      expiresAt: timestamp({ withTimezone: true }).notNull(),
    },
    () => [systemAccess("repo_locks")],
  )
  .enableRLS()

// Taken when free, expired, or already ours (a retried job re-takes its own lease).
export async function takeRepoLock(repo: string, holder: string, leaseSeconds: number): Promise<boolean> {
  const expiresAt = sql`now() + make_interval(secs => ${leaseSeconds})`
  const rows = await q((tx) =>
    tx
      .insert(repoLocks)
      .values({ repo, holder, expiresAt })
      .onConflictDoUpdate({
        target: repoLocks.repo,
        set: { holder, expiresAt },
        setWhere: or(lt(repoLocks.expiresAt, sql`now()`), eq(repoLocks.holder, holder)),
      })
      .returning({ repo: repoLocks.repo }),
  )
  return rows.length > 0
}

export async function releaseRepoLock(repo: string, holder: string): Promise<void> {
  await q((tx) => tx.delete(repoLocks).where(and(eq(repoLocks.repo, repo), eq(repoLocks.holder, holder))))
}
