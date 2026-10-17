import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { boolean, index, integer, pgPolicy, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import { app, appRole, q, systemAccess } from "./client"
import { repoAccess } from "./access"
import { alerts } from "./alerts"

// Open pull requests, as a projection. A closed or merged one is deleted.
export const pullRequests = app
  .table(
    "pull_requests",
    {
      repo: text().notNull(),
      number: integer().notNull(),
      org: text().notNull(),
      title: text().notNull(),
      author: text().notNull(),
      headRef: text().notNull(),
      headSha: text().notNull(),
      baseRef: text().notNull(),
      draft: boolean().notNull().default(false),
      url: text().notNull(),
      openedAt: timestamp({ withTimezone: true }).notNull(),
      updatedAt: timestamp({ withTimezone: true }).notNull(),
    },
    (t) => [systemAccess("pull_requests"), 
      primaryKey({ columns: [t.repo, t.number] }),
      index().on(t.org, t.updatedAt),
      pgPolicy("pull_requests_readable", { for: "select", to: appRole, using: sql`authz.can_read(repo)` }),
    ],
  )
  .enableRLS()

export type PullRequestDoc = typeof pullRequests.$inferSelect
export type PullRequestFacts = Omit<PullRequestDoc, "org">

export async function upsertPullRequest(facts: PullRequestFacts): Promise<void> {
  const row = { ...facts, org: facts.repo.split("/")[0] }
  await q((tx) =>
    tx.insert(pullRequests).values(row).onConflictDoUpdate({ target: [pullRequests.repo, pullRequests.number], set: row }),
  )
}

export async function removePullRequest(repo: string, number: number): Promise<void> {
  await q((tx) => tx.delete(pullRequests).where(and(eq(pullRequests.repo, repo), eq(pullRequests.number, number))))
}

// Replace one repository's rows with what GitHub lists as open right now.
export async function replaceRepoPullRequests(repo: string, open: PullRequestFacts[]): Promise<void> {
  await q(async (tx) => {
    await tx.delete(pullRequests).where(eq(pullRequests.repo, repo))
    if (open.length === 0) return
    await tx
      .insert(pullRequests)
      .values(open.map((facts) => ({ ...facts, repo, org: repo.split("/")[0] })))
      .onConflictDoNothing()
  })
}

export type PullRequestPage = {
  rows: (PullRequestDoc & { openAlerts: number })[]
  total: number
  hasMore: boolean
}

export async function listOpenPullRequests(
  login: string,
  orgs: string[],
  paging: { skip: number; perPage: number },
): Promise<PullRequestPage> {
  const filter = and(
    sql`exists (select 1 from ${repoAccess} a where a.login = ${login.toLowerCase()} and a.repo = ${pullRequests.repo})`,
    orgs.length > 0 ? inArray(pullRequests.org, orgs) : undefined,
  )
  const openAlerts = sql<number>`(select count(*)::int from ${alerts} al where al.repo = ${pullRequests.repo}
    and (al.pull_request->>'number')::int = ${pullRequests.number} and al.state = 'open' and al.archived_at is null)`

  const [rows, counted] = await q((tx) =>
    Promise.all([
      tx
        .select({ pr: pullRequests, openAlerts })
        .from(pullRequests)
        .where(filter)
        .orderBy(desc(pullRequests.updatedAt))
        .offset(paging.skip)
        .limit(paging.perPage),
      tx.select({ n: sql<number>`count(*)::int` }).from(pullRequests).where(filter),
    ]),
  )
  const total = counted[0]?.n ?? 0
  return {
    rows: rows.map(({ pr, openAlerts }) => ({ ...pr, openAlerts })),
    total,
    hasMore: paging.skip + rows.length < total,
  }
}
