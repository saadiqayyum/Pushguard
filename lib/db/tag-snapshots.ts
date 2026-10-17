import { and, eq, notInArray, sql } from "drizzle-orm"
import { primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import { app, q, systemAccess } from "./client"

// The last tag-to-commit map seen per repository. GitHub sends no event for
// a bulk tag push, so this is how a repoint is noticed. System-only.
export const tagSnapshots = app
  .table(
    "tag_snapshots",
    {
      repo: text().notNull(),
      tag: text().notNull(),
      sha: text().notNull(),
      seenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [systemAccess("tag_snapshots"), primaryKey({ columns: [t.repo, t.tag] })],
  )
  .enableRLS()

export async function storedTags(repo: string): Promise<Map<string, string>> {
  const rows = await q((tx) => tx.select({ tag: tagSnapshots.tag, sha: tagSnapshots.sha }).from(tagSnapshots).where(eq(tagSnapshots.repo, repo)))
  return new Map(rows.map((row) => [row.tag, row.sha]))
}

// A truncated listing keeps tags it did not reach rather than forgetting them.
export async function saveTags(repo: string, tags: { tag: string; sha: string }[], truncated: boolean): Promise<void> {
  await q(async (tx) => {
    if (tags.length > 0) {
      await tx
        .insert(tagSnapshots)
        .values(tags.map((t) => ({ repo, ...t })))
        .onConflictDoUpdate({ target: [tagSnapshots.repo, tagSnapshots.tag], set: { sha: sql`excluded.sha`, seenAt: new Date() } })
    }
    if (!truncated) {
      const names = tags.map((t) => t.tag)
      await tx.delete(tagSnapshots).where(names.length > 0 ? and(eq(tagSnapshots.repo, repo), notInArray(tagSnapshots.tag, names)) : eq(tagSnapshots.repo, repo))
    }
  })
}

// A tag push Pushguard saw and already judged, so the next snapshot does not
// report it again. Inserts only into a snapshot that exists: one row is not a baseline.
export async function noteTagPush(repo: string, tag: string, sha: string | null): Promise<void> {
  await q(async (tx) => {
    if (sha === null) {
      await tx.delete(tagSnapshots).where(and(eq(tagSnapshots.repo, repo), eq(tagSnapshots.tag, tag)))
      return
    }
    await tx.execute(sql`
      insert into app.tag_snapshots (repo, tag, sha)
      select ${repo}, ${tag}, ${sha} where exists (select 1 from app.tag_snapshots where repo = ${repo})
      on conflict (repo, tag) do update set sha = excluded.sha, seen_at = now()`)
  })
}
