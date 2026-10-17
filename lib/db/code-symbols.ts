import { and, asc, eq, inArray, sql } from "drizzle-orm"
import { index, integer, pgPolicy, primaryKey, text } from "drizzle-orm/pg-core"
import type { SymbolKind, SymbolRef } from "@/lib/code-intel/types"
import { app, appRole, q, systemAccess } from "./client"

// Definitions and references per file, from tree-sitter tags. Names and line
// numbers only, never source. Written by jobs; read by members of the repo.
export const codeSymbols = app
  .table(
    "code_symbols",
    {
      repo: text().notNull(),
      path: text().notNull(),
      blobSha: text().notNull(),
      name: text().notNull(),
      kind: text().$type<SymbolKind>().notNull(),
      role: text().$type<SymbolRef["role"]>().notNull(),
      line: integer().notNull(),
      endLine: integer(),
    },
    (t) => [
      systemAccess("code_symbols"),
      primaryKey({ columns: [t.repo, t.path, t.name, t.role, t.line] }),
      index().on(t.repo, t.name, t.role),
      pgPolicy("code_symbols_readable", { for: "select", to: appRole, using: sql`authz.can_read(repo)` }),
    ],
  )
  .enableRLS()

// Postgres caps one statement at 65535 parameters; eight columns per row.
const INSERT_CHUNK = 5_000

const columns = {
  repo: codeSymbols.repo,
  path: codeSymbols.path,
  name: codeSymbols.name,
  kind: codeSymbols.kind,
  role: codeSymbols.role,
  line: codeSymbols.line,
  endLine: codeSymbols.endLine,
}

// Each file's symbols are replaced whole, so a removed definition disappears.
export async function replaceFileSymbols(
  repo: string,
  files: { path: string; blobSha: string; symbols: Omit<SymbolRef, "repo">[] }[],
  removed: string[] = [],
): Promise<void> {
  const paths = [...files.map((f) => f.path), ...removed]
  if (paths.length === 0) return
  const rows = files.flatMap((f) => f.symbols.map((s) => ({ ...s, repo, path: f.path, blobSha: f.blobSha })))
  await q(async (tx) => {
    await tx.delete(codeSymbols).where(and(eq(codeSymbols.repo, repo), inArray(codeSymbols.path, paths)))
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      await tx.insert(codeSymbols).values(rows.slice(i, i + INSERT_CHUNK)).onConflictDoNothing()
    }
  })
}

export async function symbolsNamed(repo: string, name: string, role: SymbolRef["role"], limit: number): Promise<SymbolRef[]> {
  return q((tx) =>
    tx
      .select(columns)
      .from(codeSymbols)
      .where(and(eq(codeSymbols.repo, repo), eq(codeSymbols.name, name), eq(codeSymbols.role, role)))
      .orderBy(asc(codeSymbols.path), asc(codeSymbols.line))
      .limit(limit),
  )
}

export async function symbolsInPath(repo: string, path: string, limit: number): Promise<SymbolRef[]> {
  return q((tx) =>
    tx
      .select(columns)
      .from(codeSymbols)
      .where(and(eq(codeSymbols.repo, repo), eq(codeSymbols.path, path)))
      .orderBy(asc(codeSymbols.line))
      .limit(limit),
  )
}

export async function dropSymbols(repoNames: string[]): Promise<void> {
  if (repoNames.length === 0) return
  await q((tx) => tx.delete(codeSymbols).where(inArray(codeSymbols.repo, repoNames)))
}
