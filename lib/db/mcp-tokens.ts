import { and, asc, eq, sql } from "drizzle-orm"
import { pgPolicy, text, timestamp } from "drizzle-orm/pg-core"
import { app, appRole, q, systemAccess } from "./client"

// Bearer tokens for the read-only MCP endpoint. Only the SHA-256 is stored, and
// the app role has no SELECT on it: lookup by hash runs as system.
export const mcpTokens = app
  .table(
    "mcp_tokens",
    {
      id: text().primaryKey(),
      org: text().notNull(),
      label: text().notNull(),
      hash: text().notNull().unique(),
      hint: text().notNull(),
      createdBy: text().notNull(),
      createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
      lastUsedAt: timestamp({ withTimezone: true }),
    },
    () => [
      systemAccess("mcp_tokens"),
      pgPolicy("mcp_tokens_admin", {
        for: "all",
        to: appRole,
        using: sql`authz.is_admin(org)`,
        withCheck: sql`authz.is_admin(org)`,
      }),
    ],
  )
  .enableRLS()

export type McpTokenDoc = typeof mcpTokens.$inferSelect
export type PublicMcpToken = Omit<McpTokenDoc, "hash" | "org" | "createdBy">

const publicColumns = {
  id: mcpTokens.id,
  label: mcpTokens.label,
  hint: mcpTokens.hint,
  createdAt: mcpTokens.createdAt,
  lastUsedAt: mcpTokens.lastUsedAt,
}

export async function publicMcpTokens(org: string): Promise<PublicMcpToken[]> {
  return q((tx) => tx.select(publicColumns).from(mcpTokens).where(eq(mcpTokens.org, org)).orderBy(asc(mcpTokens.createdAt)))
}

export async function insertMcpToken(token: typeof mcpTokens.$inferInsert): Promise<void> {
  await q((tx) => tx.insert(mcpTokens).values(token))
}

export async function deleteMcpToken(org: string, id: string): Promise<boolean> {
  const rows = await q((tx) =>
    tx.delete(mcpTokens).where(and(eq(mcpTokens.org, org), eq(mcpTokens.id, id))).returning({ id: mcpTokens.id }),
  )
  return rows.length > 0
}

// System context only. Touches lastUsedAt in the same statement.
export async function mcpTokenByHash(hash: string): Promise<{ id: string; org: string } | null> {
  const rows = await q((tx) =>
    tx
      .update(mcpTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(mcpTokens.hash, hash))
      .returning({ id: mcpTokens.id, org: mcpTokens.org }),
  )
  return rows[0] ?? null
}
