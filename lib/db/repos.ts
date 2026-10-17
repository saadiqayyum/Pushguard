import { and, eq, inArray, isNotNull, like, sql } from "drizzle-orm"
import { boolean, index, integer, pgPolicy, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import { app, appRole, q, systemAccess } from "./client"
import { repoAccess } from "./access"
import { alerts } from "./alerts"
import { dependencyInventory } from "./dependency-inventory"
import { pullRequests } from "./pull-requests"
import { reviewSessions } from "./review-sessions"
import { tagSnapshots } from "./tag-snapshots"

export const repos = app
  .table(
    "repos",
    {
      fullName: text().primaryKey(),
      org: text().notNull(),
      defaultBranch: text().notNull().default("main"),
      branches: text().array().notNull().default(sql`'{}'`),
      branchesTruncated: boolean().notNull().default(false),
      archived: boolean().notNull().default(false),
      private: boolean(),
      syncedAt: timestamp({ withTimezone: true }),
      updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [systemAccess("repos"), 
      index().on(t.org),
      pgPolicy("repos_readable", { for: "select", to: appRole, using: sql`authz.can_read(full_name)` }),
    ],
  )
  .enableRLS()

export type RepoDoc = typeof repos.$inferSelect

export async function repoRecord(fullName: string): Promise<RepoDoc | null> {
  const rows = await q((tx) => tx.select().from(repos).where(eq(repos.fullName, fullName)).limit(1))
  return rows[0] ?? null
}

export async function saveRepo(fullName: string, fields: Omit<typeof repos.$inferInsert, "fullName" | "org">) {
  await q((tx) =>
    tx
      .insert(repos)
      .values({ fullName, org: fullName.split("/")[0], ...fields })
      .onConflictDoUpdate({ target: repos.fullName, set: { ...fields, updatedAt: new Date() } }),
  )
}

// Merges webhook facts. Never creates a branch list; only a full sync does.
export async function noteRepo(
  fullName: string,
  patch: Partial<Pick<RepoDoc, "defaultBranch" | "archived" | "private">> & {
    addBranch?: string
    removeBranch?: string
  },
): Promise<void> {
  const { addBranch, removeBranch, ...fields } = patch
  const set = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined))
  await q(async (tx) => {
    await tx
      .insert(repos)
      .values({ fullName, org: fullName.split("/")[0], ...set })
      .onConflictDoUpdate({ target: repos.fullName, set: { ...set, updatedAt: new Date() } })
    if (removeBranch) {
      await tx
        .update(repos)
        .set({ branches: sql`array_remove(${repos.branches}, ${removeBranch})` })
        .where(eq(repos.fullName, fullName))
    }
    if (addBranch) {
      await tx
        .update(repos)
        .set({ branches: sql`array_append(${repos.branches}, ${addBranch})` })
        .where(
          and(
            eq(repos.fullName, fullName),
            isNotNull(repos.syncedAt),
            sql`not (${addBranch} = any(${repos.branches}))`,
          ),
        )
    }
  })
}

export const pushActors = app
  .table(
    "push_actors",
    {
      repo: text().notNull(),
      sender: text().notNull(),
      firstSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
      pushes: integer().notNull().default(1),
    },
    (t) => [systemAccess("push_actors"), primaryKey({ columns: [t.repo, t.sender] })],
  )
  .enableRLS()

// True only for the inserting caller, so two racing pushes cannot both be first.
export async function recordPushActor(repo: string, sender: string): Promise<boolean> {
  const rows = await q((tx) =>
    tx
      .insert(pushActors)
      .values({ repo, sender })
      .onConflictDoUpdate({
        target: [pushActors.repo, pushActors.sender],
        set: { pushes: sql`${pushActors.pushes} + 1` },
      })
      .returning({ inserted: sql<boolean>`xmax = 0` }),
  )
  return rows[0]?.inserted ?? false
}

// A repository's full name is its key in every projection, so a rename that
// moves only the repos row makes the repository look new.
export async function renameRepoProjections(from: string, to: string): Promise<void> {
  if (from === to) return
  await q(async (tx) => {
    await tx.update(repos).set({ fullName: to, updatedAt: new Date() }).where(eq(repos.fullName, from))
    await tx.update(pushActors).set({ repo: to }).where(eq(pushActors.repo, from))
    await tx.update(repoAccess).set({ repo: to }).where(eq(repoAccess.repo, from))
    await tx.update(alerts).set({ repo: to }).where(eq(alerts.repo, from))
    await tx.update(pullRequests).set({ repo: to }).where(eq(pullRequests.repo, from))
    await tx.update(reviewSessions).set({ repo: to }).where(eq(reviewSessions.repo, from))
    await tx.update(dependencyInventory).set({ repo: to }).where(eq(dependencyInventory.repo, from))
    await tx.update(tagSnapshots).set({ repo: to }).where(eq(tagSnapshots.repo, from))
  })
}

// Drop what is derived from GitHub. Scans, rules, filed alerts and tag
// snapshots survive: a repo removed and re-added must not reset its baseline.
export async function purgeRepoProjections(repoNames: string[]): Promise<void> {
  if (repoNames.length === 0) return
  await q(async (tx) => {
    await tx.delete(repos).where(inArray(repos.fullName, repoNames))
    await tx.delete(repoAccess).where(inArray(repoAccess.repo, repoNames))
    await tx.delete(pushActors).where(inArray(pushActors.repo, repoNames))
    await tx.delete(pullRequests).where(inArray(pullRequests.repo, repoNames))
    await tx.delete(dependencyInventory).where(inArray(dependencyInventory.repo, repoNames))
  })
}

export async function purgeOrgProjections(org: string): Promise<void> {
  const prefix = `${org.replace(/[\\%_]/g, "\\$&")}/%`
  await q(async (tx) => {
    await tx.delete(repos).where(eq(repos.org, org))
    await tx.delete(repoAccess).where(eq(repoAccess.org, org))
    await tx.delete(pushActors).where(like(pushActors.repo, prefix))
    await tx.delete(pullRequests).where(eq(pullRequests.org, org))
    await tx.delete(dependencyInventory).where(like(dependencyInventory.repo, prefix))
  })
}

// Counts only what the caller can read, so it measures their sync, not the org's.
export async function countSyncedRepos(org: string): Promise<number> {
  const rows = await q((tx) =>
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(repos)
      .where(and(eq(repos.org, org), isNotNull(repos.syncedAt))),
  )
  return rows[0]?.n ?? 0
}
