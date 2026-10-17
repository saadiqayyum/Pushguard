import { and, eq } from "drizzle-orm"
import { boolean, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import { app, q, systemAccess } from "./client"

// Whether an action commit is reachable in its own repository. Public facts
// about public repositories, shared across tenants and read only by jobs.
export const actionPinVerdicts = app
  .table(
    "action_pin_verdicts",
    {
      repo: text().notNull(),
      sha: text().notNull(),
      reachable: boolean().notNull(),
      checkedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [systemAccess("action_pin_verdicts"), primaryKey({ columns: [t.repo, t.sha] })],
  )
  .enableRLS()

export async function cachedPinVerdict(repo: string, sha: string): Promise<{ reachable: boolean; checkedAt: Date } | null> {
  const rows = await q((tx) =>
    tx
      .select({ reachable: actionPinVerdicts.reachable, checkedAt: actionPinVerdicts.checkedAt })
      .from(actionPinVerdicts)
      .where(and(eq(actionPinVerdicts.repo, repo), eq(actionPinVerdicts.sha, sha.toLowerCase())))
      .limit(1),
  )
  return rows[0] ?? null
}

export async function recordPinVerdict(repo: string, sha: string, reachable: boolean): Promise<void> {
  const row = { repo, sha: sha.toLowerCase(), reachable, checkedAt: new Date() }
  await q((tx) =>
    tx.insert(actionPinVerdicts).values(row).onConflictDoUpdate({ target: [actionPinVerdicts.repo, actionPinVerdicts.sha], set: row }),
  )
}
