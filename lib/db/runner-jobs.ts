import { createHash, randomBytes } from "node:crypto"
import { and, count, eq, gt, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm"
import { bigint, index, integer, jsonb, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import type { SealedSecret } from "@/lib/secret-box"
import { FETCH_NONCE_TTL_MS, REPORT_TOKEN_TTL_MS, RUNNER_TOKEN_BYTES } from "@/lib/runner/limits"
import type { DetonatePhase } from "@/schemas/rule-advanced"
import type { RunnerKind, RunnerReport } from "@/schemas/runner"
import { app, q, systemAccess } from "./client"

export type RunnerStatus = "dispatched" | "fetched" | "reported" | "failed" | "expired"

export type RunnerResult = { report?: RunnerReport; suspect: string[]; error?: string }

// Only token hashes are stored. The trigger label is sealed so an unfetched job
// can still remove it; it is cleared once the nonce is redeemed.
export const runnerJobs = app
  .table(
    "runner_jobs",
    {
      id: uuid().primaryKey().defaultRandom(),
      installationId: bigint({ mode: "number" }).notNull(),
      org: text().notNull(),
      repo: text().notNull(),
      sha: text().notNull(),
      kind: text().$type<RunnerKind>().notNull(),
      runnerRepo: text(),
      runnerInstallationId: bigint({ mode: "number" }),
      label: jsonb().$type<SealedSecret>(),
      phases: text().array().$type<DetonatePhase[]>(),
      checkScriptId: text(),
      checkScriptVersion: integer(),
      status: text().$type<RunnerStatus>().notNull().default("dispatched"),
      fetchNonceHash: text().notNull(),
      fetchNonceExpiresAt: timestamp({ withTimezone: true }).notNull(),
      fetchedAt: timestamp({ withTimezone: true }),
      reportTokenHash: text(),
      reportExpiresAt: timestamp({ withTimezone: true }),
      reportedAt: timestamp({ withTimezone: true }),
      result: jsonb().$type<RunnerResult>(),
      createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [
      systemAccess("runner_jobs"),
      uniqueIndex().on(t.fetchNonceHash),
      uniqueIndex().on(t.reportTokenHash),
      index().on(t.status, t.createdAt),
      index().on(t.org, t.createdAt),
    ],
  )
  .enableRLS()

export type RunnerJobDoc = typeof runnerJobs.$inferSelect

export const mintRunnerToken = () => randomBytes(RUNNER_TOKEN_BYTES).toString("base64url")
const digest = (token: string) => createHash("sha256").update(token).digest("hex")

export async function createRunnerJob(
  job: {
    installationId: number
    org: string
    repo: string
    sha: string
    kind: RunnerKind
    runnerRepo: string
    runnerInstallationId: number
    label: SealedSecret
    phases?: DetonatePhase[]
    checkScriptId?: string
    checkScriptVersion?: number
  },
  nonce: string,
): Promise<string> {
  const rows = await q((tx) =>
    tx
      .insert(runnerJobs)
      .values({
        ...job,
        fetchNonceHash: digest(nonce),
        fetchNonceExpiresAt: new Date(Date.now() + FETCH_NONCE_TTL_MS),
      })
      .returning({ id: runnerJobs.id }),
  )
  return rows[0].id
}

// Burns the nonce in the same statement that checks it, and mints the report
// token only now, so it never exists before the runner has proven the nonce.
export async function redeemFetchNonce(nonce: string): Promise<{ job: RunnerJobDoc; reportToken: string } | null> {
  const reportToken = mintRunnerToken()
  const rows = await q((tx) =>
    tx
      .update(runnerJobs)
      .set({
        status: "fetched",
        fetchedAt: sql`now()`,
        label: null,
        reportTokenHash: digest(reportToken),
        reportExpiresAt: new Date(Date.now() + REPORT_TOKEN_TTL_MS),
      })
      .where(
        and(
          eq(runnerJobs.fetchNonceHash, digest(nonce)),
          isNull(runnerJobs.fetchedAt),
          gt(runnerJobs.fetchNonceExpiresAt, sql`now()`),
        ),
      )
      .returning(),
  )
  return rows[0] ? { job: rows[0], reportToken } : null
}

const reportable = (token: string) =>
  and(
    eq(runnerJobs.reportTokenHash, digest(token)),
    isNotNull(runnerJobs.fetchedAt),
    isNull(runnerJobs.reportedAt),
    eq(runnerJobs.status, "fetched"),
    gt(runnerJobs.reportExpiresAt, sql`now()`),
  )

export async function runnerJobForReport(token: string): Promise<RunnerJobDoc | null> {
  const rows = await q((tx) => tx.select().from(runnerJobs).where(reportable(token)).limit(1))
  return rows[0] ?? null
}

// One report per job: the second POST with the same token matches nothing.
export async function acceptReport(token: string, result: RunnerResult): Promise<string | null> {
  const rows = await q((tx) =>
    tx
      .update(runnerJobs)
      .set({ status: "reported", reportedAt: sql`now()`, result })
      .where(reportable(token))
      .returning({ id: runnerJobs.id }),
  )
  return rows[0]?.id ?? null
}

export async function failRunnerJob(id: string, error: string): Promise<void> {
  await q((tx) =>
    tx
      .update(runnerJobs)
      .set({ status: "failed", result: { suspect: [], error } })
      .where(and(eq(runnerJobs.id, id), inArray(runnerJobs.status, ["dispatched", "fetched"]))),
  )
}

export async function runnerJob(id: string): Promise<RunnerJobDoc | null> {
  const rows = await q((tx) => tx.select().from(runnerJobs).where(eq(runnerJobs.id, id)).limit(1))
  return rows[0] ?? null
}

// Closes jobs whose runner never fetched or never reported, so silence becomes a finding.
export async function expireRunnerJobs(limit: number): Promise<RunnerJobDoc[]> {
  return q(async (tx) => {
    const overdue = tx
      .select({ id: runnerJobs.id })
      .from(runnerJobs)
      .where(
        or(
          and(eq(runnerJobs.status, "dispatched"), lt(runnerJobs.fetchNonceExpiresAt, sql`now()`)),
          and(eq(runnerJobs.status, "fetched"), lt(runnerJobs.reportExpiresAt, sql`now()`)),
        ),
      )
      .limit(limit)
      .for("update", { skipLocked: true })
    return tx.update(runnerJobs).set({ status: "expired" }).where(inArray(runnerJobs.id, overdue)).returning()
  })
}

export async function runnerJobsThisMonth(org: string, runnerRepo: string): Promise<number> {
  const rows = await q((tx) =>
    tx
      .select({ n: count() })
      .from(runnerJobs)
      .where(
        and(
          eq(runnerJobs.org, org),
          eq(runnerJobs.runnerRepo, runnerRepo),
          gte(runnerJobs.createdAt, sql`date_trunc('month', now())`),
        ),
      ),
  )
  return rows[0]?.n ?? 0
}
