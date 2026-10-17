import { and, desc, eq, gte, lt, or, sql } from "drizzle-orm"
import { bigint, boolean, index, integer, jsonb, pgPolicy, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"
import type { ErrorCode } from "@/lib/errors"
import type { Severity } from "@/schemas/rule"
import { app, appRole, q, systemAccess } from "./client"
import { STUCK_AFTER_MS } from "./limits"

// With `prose`, lines are sentences rather than quoted source: wrapped, not code-formatted.
export type ScanFinding = {
  ruleId: string
  severity: Severity
  description?: string
  repo: string
  files: string[]
  lines: string[]
  prose?: true
}

// What a scan read, per repository. "No findings" and "not scanned" differ.
export type ScanRepo = {
  repo: string
  branch: string
  commits: number
  headSha: string
  baseSha: string | null
  truncated: boolean
}

export type ScanStatus = "queued" | "running" | "done" | "failed"

// A scan is private to the account that ran it.
export const scans = app
  .table(
    "scans",
    {
      id: text().primaryKey(),
      owner: text().notNull(),
      target: text().notNull(),
      branch: text(),
      scope: text().$type<"repo" | "org">().notNull(),
      aiKey: text(),
      status: text().$type<ScanStatus>().notNull(),
      active: boolean(),
      installationId: bigint({ mode: "number" }).notNull(),
      account: text().notNull(),
      repos: text().array().notNull().default(sql`'{}'`),
      scanned: jsonb().$type<ScanRepo[]>().notNull().default([]),
      findings: jsonb().$type<ScanFinding[]>().notNull().default([]),
      skippedRepos: integer().notNull().default(0),
      error: text(),
      errorCode: text().$type<ErrorCode>(),
      filed: jsonb().$type<{ repo: string; number: number; url: string }[]>().notNull().default([]),
      filingFailed: jsonb().$type<{ repo: string; reason: string }[]>().notNull().default([]),
      createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
      startedAt: timestamp({ withTimezone: true }),
      finishedAt: timestamp({ withTimezone: true }),
    },
    (t) => [systemAccess("scans"), 
      index().on(t.owner, t.createdAt),
      index().on(t.status, t.createdAt),
      uniqueIndex("scans_one_active_per_owner").on(t.owner).where(sql`active`),
      pgPolicy("scans_own_read", { for: "select", to: appRole, using: sql`owner = authz.current_login()` }),
      pgPolicy("scans_own_insert", { for: "insert", to: appRole, withCheck: sql`owner = authz.current_login()` }),
    ],
  )
  .enableRLS()

export type ScanDoc = typeof scans.$inferSelect

// Missing and someone else's both come back null, so an id does not reveal
// that another account owns it.
export async function readableScan(id: string, login: string): Promise<ScanDoc | null> {
  if (!login) return null
  const rows = await q((tx) =>
    tx.select().from(scans).where(and(eq(scans.id, id), eq(scans.owner, login.toLowerCase()))).limit(1),
  )
  return rows[0] ?? null
}

export async function scanById(id: string): Promise<ScanDoc | null> {
  const rows = await q((tx) => tx.select().from(scans).where(eq(scans.id, id)).limit(1))
  return rows[0] ?? null
}

export async function scansSince(owner: string, since: Date): Promise<number> {
  const rows = await q((tx) =>
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(scans)
      .where(and(eq(scans.owner, owner.toLowerCase()), gte(scans.createdAt, since))),
  )
  return rows[0]?.n ?? 0
}

export async function insertScan(scan: typeof scans.$inferInsert): Promise<ScanDoc> {
  const rows = await q((tx) => tx.insert(scans).values({ ...scan, owner: scan.owner.toLowerCase() }).returning())
  return rows[0]
}

// The app role cannot reach the queue; app.enqueue_scan checks the scan is the caller's own.
export async function queueScan(id: string): Promise<void> {
  await q((tx) => tx.execute(sql`select app.enqueue_scan(${id})`))
}

export async function updateScan(id: string, patch: Partial<typeof scans.$inferInsert>): Promise<void> {
  await q((tx) => tx.update(scans).set(patch).where(eq(scans.id, id)))
}

// Claims a queued scan, or one whose invocation died mid-run. Null when another
// invocation holds it.
export async function claimScan(id: string): Promise<ScanDoc | null> {
  const stuck = new Date(Date.now() - STUCK_AFTER_MS)
  const rows = await q((tx) =>
    tx
      .update(scans)
      .set({ status: "running", startedAt: new Date() })
      .where(
        and(
          eq(scans.id, id),
          or(eq(scans.status, "queued"), and(eq(scans.status, "running"), lt(scans.startedAt, stuck))),
        ),
      )
      .returning(),
  )
  return rows[0] ?? null
}

export async function addScanFiling(id: string, entry: { repo: string; number: number; url: string }): Promise<void> {
  await q((tx) =>
    tx
      .update(scans)
      .set({
        filed: sql`case when ${scans.filed} @> ${JSON.stringify([entry])}::jsonb then ${scans.filed} else ${scans.filed} || ${JSON.stringify([entry])}::jsonb end`,
      })
      .where(eq(scans.id, id)),
  )
}

export async function scansPage(owner: string, paging: { skip: number; perPage: number }) {
  return q(async (tx) => {
    const [rows, counted] = await Promise.all([
      tx
        .select()
        .from(scans)
        .where(eq(scans.owner, owner.toLowerCase()))
        .orderBy(desc(scans.createdAt))
        .offset(paging.skip)
        .limit(paging.perPage),
      tx.select({ n: sql<number>`count(*)::int` }).from(scans).where(eq(scans.owner, owner.toLowerCase())),
    ])
    return { rows, total: counted[0]?.n ?? 0 }
  })
}

// Goes through app.enqueue_scan_filing, which checks the scan is the caller's
// and takes the filer from the session, so a user cannot queue filing as someone else.
export async function queueScanFiling(id: string, repos: string[] | null): Promise<void> {
  await q((tx) => tx.execute(sql`select app.enqueue_scan_filing(${id}, ${repos === null ? null : sql.param(repos)}::text[])`))
}

export async function setScanFilingFailed(id: string, failed: { repo: string; reason: string }[]): Promise<void> {
  await q((tx) => tx.update(scans).set({ filingFailed: failed }).where(eq(scans.id, id)))
}

export function serializeScan(doc: ScanDoc) {
  return {
    id: doc.id,
    target: doc.target,
    branch: doc.branch ?? null,
    scope: doc.scope,
    status: doc.status,
    repos: doc.repos,
    scanned: doc.scanned ?? [],
    findings: doc.findings,
    skippedRepos: doc.skippedRepos,
    error: doc.error ?? null,
    needsInstall: doc.errorCode === "install_required",
    filed: doc.filed,
    filingFailed: doc.filingFailed,
    account: doc.account,
    createdAt: doc.createdAt.toISOString(),
    finishedAt: doc.finishedAt?.toISOString() ?? null,
  }
}

export type ScanView = ReturnType<typeof serializeScan>
