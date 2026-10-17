import { and, eq, inArray, lt, or, sql } from "drizzle-orm"
import { bigint, index, integer, jsonb, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import type { Severity } from "@/schemas/rule"
import type { ModelSettings } from "@/schemas/ai-rule"
import { app, q, systemAccess } from "./client"
import { STUCK_AFTER_MS } from "./limits"
import type { ScanFinding } from "./scans"

export type ReviewSessionRule = {
  id: string
  prompt: string
  severity: Severity
  paths?: string[]
  exclude_paths?: string[]
  budget: number
  key?: string
  done: boolean
} & ModelSettings

// A repository-scope review, pinned to one commit and resumed across jobs.
// Holds paths and progress, never source.
export const reviewSessions = app
  .table(
    "review_sessions",
    {
      id: text().primaryKey(),
      org: text().notNull(),
      installationId: bigint({ mode: "number" }).notNull(),
      repo: text().notNull(),
      branch: text().notNull(),
      sha: text().notNull(),
      baseSha: text(),
      source: text().$type<"push" | "scan" | "pull_request">().notNull(),
      pullRequest: jsonb().$type<{ number: number; base: string; url: string }>(),
      rules: jsonb().$type<ReviewSessionRule[]>().notNull(),
      seeds: text().array().notNull().default(sql`'{}'`),
      findings: jsonb().$type<ScanFinding[]>().notNull().default([]),
      status: text().$type<"queued" | "running" | "paused" | "done" | "failed">().notNull().default("queued"),
      attempts: integer().notNull().default(0),
      error: text(),
      createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
      startedAt: timestamp({ withTimezone: true }),
      finishedAt: timestamp({ withTimezone: true }),
    },
    (t) => [systemAccess("review_sessions"), 
      index().on(t.org, t.createdAt),
      // One queued session per repository, so a burst of pushes cannot queue a
      // hundred whole-repository reviews of the same code.
      uniqueIndex("review_sessions_one_queued").on(t.repo).where(sql`status = 'queued'`),
    ],
  )
  .enableRLS()

export type ReviewSessionDoc = typeof reviewSessions.$inferSelect

// Replaces the queued session for this repository, or creates one. Returns its id.
export async function upsertQueuedSession(
  session: Omit<typeof reviewSessions.$inferInsert, "id" | "status" | "attempts" | "createdAt">,
): Promise<string> {
  const rows = await q((tx) =>
    tx
      .insert(reviewSessions)
      .values({ id: crypto.randomUUID(), ...session })
      .onConflictDoUpdate({
        target: reviewSessions.repo,
        targetWhere: sql`status = 'queued'`,
        set: { ...session },
      })
      .returning({ id: reviewSessions.id }),
  )
  return rows[0].id
}

export async function reviewSession(id: string): Promise<ReviewSessionDoc | null> {
  const rows = await q((tx) => tx.select().from(reviewSessions).where(eq(reviewSessions.id, id)).limit(1))
  return rows[0] ?? null
}

// Claims a queued or paused session, or one whose invocation died mid-run.
// Paused is not queued, so a resuming session never collides with a newer queued one.
export async function claimReviewSession(id: string): Promise<ReviewSessionDoc | null> {
  const stuck = new Date(Date.now() - STUCK_AFTER_MS)
  const rows = await q((tx) =>
    tx
      .update(reviewSessions)
      .set({ status: "running", startedAt: new Date(), attempts: sql`${reviewSessions.attempts} + 1` })
      .where(
        and(
          eq(reviewSessions.id, id),
          or(
            inArray(reviewSessions.status, ["queued", "paused"]),
            and(eq(reviewSessions.status, "running"), lt(reviewSessions.startedAt, stuck)),
          ),
        ),
      )
      .returning(),
  )
  return rows[0] ?? null
}

export async function finishRule(id: string, ruleId: string, findings: ScanFinding[]): Promise<void> {
  await q((tx) =>
    tx
      .update(reviewSessions)
      .set({
        rules: sql`(select jsonb_agg(case when r->>'id' = ${ruleId} then jsonb_set(r, '{done}', 'true') else r end) from jsonb_array_elements(${reviewSessions.rules}) r)`,
        findings: sql`${reviewSessions.findings} || ${JSON.stringify(findings)}::jsonb`,
      })
      .where(eq(reviewSessions.id, id)),
  )
}

export async function appendSessionFindings(id: string, findings: ScanFinding[]): Promise<void> {
  if (findings.length === 0) return
  await q((tx) =>
    tx
      .update(reviewSessions)
      .set({ findings: sql`${reviewSessions.findings} || ${JSON.stringify(findings)}::jsonb` })
      .where(eq(reviewSessions.id, id)),
  )
}

export async function setReviewSessionStatus(
  id: string,
  patch: Pick<Partial<ReviewSessionDoc>, "status" | "error" | "finishedAt">,
): Promise<void> {
  await q((tx) => tx.update(reviewSessions).set(patch).where(eq(reviewSessions.id, id)))
}
