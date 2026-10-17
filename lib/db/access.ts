import { and, eq, sql } from "drizzle-orm"
import { bigint, boolean, index, pgPolicy, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import { app, appRole, q, systemAccess } from "./client"

// Who can read what, as a projection. Logins are stored lowercase.
export const repoAccess = app
  .table(
    "repo_access",
    {
      login: text().notNull(),
      repo: text().notNull(),
      org: text().notNull(),
      installationId: bigint({ mode: "number" }).notNull(),
      grants: text().array().notNull().default(sql`'{}'`),
      write: boolean().notNull().default(false),
      updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [systemAccess("repo_access"), 
      primaryKey({ columns: [t.login, t.repo] }),
      index().on(t.repo),
      index().on(t.login, t.installationId),
      pgPolicy("repo_access_own", { for: "select", to: appRole, using: sql`login = authz.current_login()` }),
    ],
  )
  .enableRLS()

export type RepoAccessDoc = typeof repoAccess.$inferSelect

// Add a reason someone can read a repository. Idempotent.
export async function grantRepoAccess(
  login: string,
  repo: string,
  installationId: number,
  grant: string,
): Promise<void> {
  await q((tx) =>
    tx
      .insert(repoAccess)
      .values({ login: login.toLowerCase(), repo, org: repo.split("/")[0], installationId, grants: [grant] })
      .onConflictDoUpdate({
        target: [repoAccess.login, repoAccess.repo],
        set: {
          installationId,
          updatedAt: new Date(),
          grants: sql`case when ${grant} = any(${repoAccess.grants}) then ${repoAccess.grants} else array_append(${repoAccess.grants}, ${grant}) end`,
        },
      }),
  )
}

// Remove one reason. The row is deleted only when no reason is left, so losing a
// team does not revoke someone who is also a direct collaborator.
export async function revokeRepoAccess(login: string, repo: string, grant: string): Promise<void> {
  const key = and(eq(repoAccess.login, login.toLowerCase()), eq(repoAccess.repo, repo))
  await q(async (tx) => {
    await tx
      .update(repoAccess)
      .set({ grants: sql`array_remove(${repoAccess.grants}, ${grant})`, updatedAt: new Date() })
      .where(key)
    await tx.delete(repoAccess).where(and(key, sql`cardinality(${repoAccess.grants}) = 0`))
  })
}

// Replace the collaborator grant for one repository. Team grants are untouched.
export async function replaceRepoAccess(
  repo: string,
  installationId: number,
  collaborators: { login: string; write: boolean }[],
): Promise<void> {
  await q(async (tx) => {
    await tx
      .update(repoAccess)
      .set({ grants: sql`array_remove(${repoAccess.grants}, 'collaborator')`, write: false })
      .where(eq(repoAccess.repo, repo))
    await tx.delete(repoAccess).where(and(eq(repoAccess.repo, repo), sql`cardinality(${repoAccess.grants}) = 0`))
    if (collaborators.length === 0) return
    await tx
      .insert(repoAccess)
      .values(
        collaborators.map(({ login, write }) => ({
          login: login.toLowerCase(),
          repo,
          org: repo.split("/")[0],
          installationId,
          write,
          grants: ["collaborator"],
        })),
      )
      .onConflictDoUpdate({
        target: [repoAccess.login, repoAccess.repo],
        set: {
          installationId,
          write: sql`excluded.write`,
          updatedAt: new Date(),
          grants: sql`array_append(${repoAccess.grants}, 'collaborator')`,
        },
      })
  })
}

export async function revokeOrgAccess(org: string, login: string): Promise<number> {
  return q(async (tx) => {
    const removed = await tx
      .delete(repoAccess)
      .where(and(eq(repoAccess.org, org), eq(repoAccess.login, login.toLowerCase())))
      .returning({ repo: repoAccess.repo })
    return removed.length
  })
}

const mine = (login: string) => eq(repoAccess.login, login.toLowerCase())

export async function accessibleRepos(login: string, installationId?: number): Promise<string[]> {
  const rows = await q((tx) =>
    tx
      .select({ repo: repoAccess.repo })
      .from(repoAccess)
      .where(and(mine(login), installationId ? eq(repoAccess.installationId, installationId) : undefined))
      .orderBy(repoAccess.repo),
  )
  return rows.map((row) => row.repo)
}

export async function accessibleInstallationIds(login: string): Promise<number[]> {
  const rows = await q((tx) =>
    tx.selectDistinct({ id: repoAccess.installationId }).from(repoAccess).where(mine(login)),
  )
  return rows.map((row) => row.id)
}

export async function canReadRepo(login: string, repo: string): Promise<boolean> {
  const rows = await q((tx) =>
    tx.select({ repo: repoAccess.repo }).from(repoAccess).where(and(mine(login), eq(repoAccess.repo, repo))).limit(1),
  )
  return rows.length > 0
}

export async function canWriteRepo(login: string, repo: string): Promise<boolean> {
  const rows = await q((tx) =>
    tx
      .select({ repo: repoAccess.repo })
      .from(repoAccess)
      .where(and(mine(login), eq(repoAccess.repo, repo), eq(repoAccess.write, true)))
      .limit(1),
  )
  return rows.length > 0
}
