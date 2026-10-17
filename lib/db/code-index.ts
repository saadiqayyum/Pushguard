import { and, eq, inArray, sql } from "drizzle-orm"
import { index, integer, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import { app, q, systemAccess } from "./client"
import { dropSymbols } from "./code-symbols"

// One row per indexed file. Names, never contents: a copy of this database
// must not be a copy of anybody's source.
export const codeIndex = app
  .table(
    "code_index",
    {
      repo: text().notNull(),
      path: text().notNull(),
      blobSha: text().notNull(),
      size: integer().notNull(),
      tokens: text().array().notNull(),
      indexedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [systemAccess("code_index"), primaryKey({ columns: [t.repo, t.path] }), index().using("gin", t.tokens)],
  )
  .enableRLS()

export async function filesMentioning(repo: string, token: string, limit = 50): Promise<string[]> {
  const rows = await q((tx) =>
    tx
      .select({ path: codeIndex.path })
      .from(codeIndex)
      .where(and(eq(codeIndex.repo, repo), sql`${codeIndex.tokens} @> array[${token}]::text[]`))
      .limit(limit),
  )
  return rows.map((row) => row.path)
}

// What the indexer holds, so unchanged files are never re-read.
export async function indexedBlobs(repo: string): Promise<Map<string, string>> {
  const rows = await q((tx) =>
    tx.select({ path: codeIndex.path, blobSha: codeIndex.blobSha }).from(codeIndex).where(eq(codeIndex.repo, repo)),
  )
  return new Map(rows.map((row) => [row.path, row.blobSha]))
}

// What the index holds for these paths, tokens included, for a patch to build on.
export async function indexedFiles(repo: string, paths: string[]): Promise<Map<string, { blobSha: string; size: number; tokens: string[] }>> {
  if (paths.length === 0) return new Map()
  const rows = await q((tx) =>
    tx
      .select({ path: codeIndex.path, blobSha: codeIndex.blobSha, size: codeIndex.size, tokens: codeIndex.tokens })
      .from(codeIndex)
      .where(and(eq(codeIndex.repo, repo), inArray(codeIndex.path, paths))),
  )
  return new Map(rows.map(({ path, ...row }) => [path, row]))
}

export async function indexedFileCount(repo: string): Promise<number> {
  const rows = await q((tx) =>
    tx.select({ n: sql<number>`count(*)::int` }).from(codeIndex).where(eq(codeIndex.repo, repo)),
  )
  return rows[0]?.n ?? 0
}

export async function writeIndex(
  repo: string,
  entries: { path: string; blobSha: string; size: number; tokens: string[] }[],
  removed: string[] = [],
): Promise<void> {
  await q(async (tx) => {
    if (entries.length > 0) {
      await tx
        .insert(codeIndex)
        .values(entries.map((entry) => ({ repo, ...entry })))
        .onConflictDoUpdate({
          target: [codeIndex.repo, codeIndex.path],
          set: {
            blobSha: sql`excluded.blob_sha`,
            size: sql`excluded.size`,
            tokens: sql`excluded.tokens`,
            indexedAt: new Date(),
          },
        })
    }
    if (removed.length > 0) {
      await tx.delete(codeIndex).where(and(eq(codeIndex.repo, repo), inArray(codeIndex.path, removed)))
    }
  })
}

export async function dropIndex(repoNames: string[]): Promise<void> {
  if (repoNames.length === 0) return
  await q((tx) => tx.delete(codeIndex).where(inArray(codeIndex.repo, repoNames)))
  await dropSymbols(repoNames)
}
