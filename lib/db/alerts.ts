import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm"
import { index, integer, jsonb, pgPolicy, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import type { Severity } from "@/schemas/rule"
import { app, appRole, q, systemAccess } from "./client"
import { repoAccess } from "./access"
import { MAX_ACTIVITY, MAX_COMMENTS, MAX_COMMENT_CHARS, MAX_SIGHTINGS } from "./limits"
import type { ScanFinding } from "./scans"

export type AlertSource = "push" | "scan" | "pull_request"

export type AlertPush = {
  branch: string
  sender: string
  pusherEmail: string | null
  before: string
  after: string
  forced: boolean
}
export type AlertActivity = { action: string; by: string | null; at: string }
export type AlertComment = { id: number; by: string; body: string; at: string }
export type AlertPullRequest = { number: number; base: string; url: string }
export type AlertSighting = {
  at: string
  ruleIds: string[]
  sha: string | null
  by: string | null
  pullRequest?: number
}

export const alerts = app
  .table(
    "alerts",
    {
      repo: text().notNull(),
      number: integer().notNull(),
      org: text().notNull(),
      url: text().notNull(),
      title: text().notNull(),
      severity: text().$type<Severity>().notNull(),
      ruleIds: text().array().notNull(),
      findings: jsonb().$type<ScanFinding[]>().notNull().default([]),
      push: jsonb().$type<AlertPush>(),
      activity: jsonb().$type<AlertActivity[]>().notNull().default([]),
      comments: jsonb().$type<AlertComment[]>().notNull().default([]),
      pullRequest: jsonb().$type<AlertPullRequest>(),
      source: text().$type<AlertSource>().notNull(),
      occurrences: integer().notNull().default(1),
      sightings: jsonb().$type<AlertSighting[]>().notNull().default([]),
      lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
      state: text().$type<"open" | "closed">().notNull().default("open"),
      acknowledgedAt: timestamp({ withTimezone: true }),
      acknowledgedBy: text(),
      assignees: text().array().notNull().default(sql`'{}'`),
      archivedAt: timestamp({ withTimezone: true }),
      archivedBy: text(),
      createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [systemAccess("alerts"), 
      primaryKey({ columns: [t.repo, t.number] }),
      index().on(t.org, t.createdAt),
      index().using("gin", t.ruleIds),
      index("alerts_push_after_idx").on(t.repo, sql`(push->>'after')`),
      pgPolicy("alerts_readable", { for: "select", to: appRole, using: sql`authz.can_read(repo)` }),
      pgPolicy("alerts_archive", {
        for: "update",
        to: appRole,
        using: sql`authz.can_read(repo)`,
        withCheck: sql`authz.can_read(repo)`,
      }),
    ],
  )
  .enableRLS()

export type AlertDoc = typeof alerts.$inferSelect

const key = (repo: string, number: number) => and(eq(alerts.repo, repo), eq(alerts.number, number))

// Appends to a capped jsonb list, keeping the newest `max` entries.
const appendCapped = (column: SQL, item: unknown, max: number) =>
  sql`authz.jsonb_tail(${column} || jsonb_build_array(${JSON.stringify(item)}::jsonb), ${max})`

// `@>`, not overlap. Overlap is not recurrence.
export async function openAlertForRules(repo: string, ruleIds: string[]): Promise<AlertDoc | null> {
  const rows = await q((tx) =>
    tx
      .select()
      .from(alerts)
      .where(
        and(
          eq(alerts.repo, repo),
          eq(alerts.state, "open"),
          isNull(alerts.archivedAt),
          sql`${alerts.ruleIds} @> ${sql.param(ruleIds)}::text[]`,
        ),
      )
      .orderBy(asc(alerts.createdAt))
      .limit(1),
  )
  return rows[0] ?? null
}

export async function alertForCommit(repo: string, sha: string): Promise<AlertDoc | null> {
  const rows = await q((tx) =>
    tx.select().from(alerts).where(and(eq(alerts.repo, repo), sql`push->>'after' = ${sha}`)).limit(1),
  )
  return rows[0] ?? null
}

// A pull request carrying a commit the push already flagged joins that alert.
// Returns false when this pull request was already on it.
export async function attachPullRequest(
  repo: string,
  number: number,
  pullRequest: AlertPullRequest,
): Promise<boolean> {
  const sighting: AlertSighting = {
    at: new Date().toISOString(),
    ruleIds: [],
    sha: null,
    by: null,
    pullRequest: pullRequest.number,
  }
  const rows = await q((tx) =>
    tx
      .update(alerts)
      .set({
        updatedAt: new Date(),
        sightings: appendCapped(sql`${alerts.sightings}`, sighting, MAX_SIGHTINGS),
        pullRequest: sql`coalesce(${alerts.pullRequest}, ${JSON.stringify(pullRequest)}::jsonb)`,
      })
      .where(
        and(
          key(repo, number),
          sql`coalesce((${alerts.pullRequest}->>'number')::int, -1) <> ${pullRequest.number}`,
          sql`not (${alerts.sightings} @> ${JSON.stringify([{ pullRequest: pullRequest.number }])}::jsonb)`,
        ),
      )
      .returning({ number: alerts.number }),
  )
  return rows.length > 0
}

export async function recordOccurrence(
  repo: string,
  number: number,
  sighting: Omit<AlertSighting, "at">,
): Promise<number> {
  const rows = await q((tx) =>
    tx
      .update(alerts)
      .set({
        occurrences: sql`${alerts.occurrences} + 1`,
        sightings: appendCapped(sql`${alerts.sightings}`, { ...sighting, at: new Date().toISOString() }, MAX_SIGHTINGS),
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(key(repo, number))
      .returning({ occurrences: alerts.occurrences }),
  )
  return rows[0]?.occurrences ?? 1
}

const withoutComment = (id: number) =>
  sql`coalesce((select jsonb_agg(c) from jsonb_array_elements(${alerts.comments}) c where (c->>'id')::bigint <> ${id}), '[]'::jsonb)`

// Idempotent on comment id, so an edit replaces rather than duplicates.
export async function upsertAlertComment(
  repo: string,
  number: number,
  comment: { id: number; by: string; body: string; at: Date },
): Promise<void> {
  const trimmed: AlertComment = { ...comment, body: comment.body.slice(0, MAX_COMMENT_CHARS), at: comment.at.toISOString() }
  await q((tx) =>
    tx
      .update(alerts)
      .set({ comments: appendCapped(withoutComment(comment.id), trimmed, MAX_COMMENTS), updatedAt: new Date() })
      .where(key(repo, number)),
  )
}

export async function removeAlertComment(repo: string, number: number, commentId: number): Promise<void> {
  await q((tx) =>
    tx.update(alerts).set({ comments: withoutComment(commentId), updatedAt: new Date() }).where(key(repo, number)),
  )
}

export async function alertExists(repo: string, number: number): Promise<boolean> {
  const rows = await q((tx) => tx.select({ n: alerts.number }).from(alerts).where(key(repo, number)).limit(1))
  return rows.length > 0
}

export async function alertPusher(repo: string, number: number): Promise<string | null> {
  const rows = await q((tx) => tx.select({ push: alerts.push }).from(alerts).where(key(repo, number)).limit(1))
  return rows[0]?.push?.sender ?? null
}

export async function forgetAlert(repo: string, number: number): Promise<void> {
  await q((tx) => tx.delete(alerts).where(key(repo, number)))
}

export type NewAlert = Pick<
  typeof alerts.$inferInsert,
  "repo" | "number" | "url" | "title" | "severity" | "ruleIds" | "findings" | "push" | "pullRequest" | "source" | "createdAt"
>

export async function recordAlert(alert: NewAlert): Promise<void> {
  const now = new Date()
  const fields = { ...alert, org: alert.repo.split("/")[0], lastSeenAt: now, updatedAt: now }
  await q((tx) =>
    tx
      .insert(alerts)
      .values(fields)
      .onConflictDoUpdate({ target: [alerts.repo, alerts.number], set: fields }),
  )
}

// `by` is null for our own writes, so filing an alert never counts as reading it.
export async function noteAlertActivity(
  repo: string,
  number: number,
  patch: {
    state?: "open" | "closed"
    by?: string | null
    assignees?: string[]
    title?: string
    action?: string
  },
): Promise<void> {
  const set: Partial<typeof alerts.$inferInsert> = { updatedAt: new Date() }
  if (patch.state) set.state = patch.state
  if (patch.assignees) set.assignees = patch.assignees
  if (patch.title) set.title = patch.title
  const by = patch.by

  await q(async (tx) => {
    if (!by) {
      await tx.update(alerts).set(set).where(key(repo, number))
      return
    }
    const entry: AlertActivity = { action: patch.action ?? "updated", by, at: new Date().toISOString() }
    await tx
      .update(alerts)
      .set({
        ...set,
        activity: appendCapped(sql`${alerts.activity}`, entry, MAX_ACTIVITY),
        acknowledgedAt: sql`coalesce(${alerts.acknowledgedAt}, now())`,
        acknowledgedBy: sql`coalesce(${alerts.acknowledgedBy}, ${by})`,
      })
      .where(key(repo, number))
  })
}

const readableBy = (login: string) =>
  sql`exists (select 1 from ${repoAccess} a where a.login = ${login.toLowerCase()} and a.repo = ${alerts.repo})`

export async function setAlertsArchived(
  login: string,
  ids: { repo: string; number: number }[],
  archived: boolean,
): Promise<number> {
  if (ids.length === 0) return 0
  const match = sql`(${alerts.repo}, ${alerts.number}) in (${sql.join(
    ids.map((id) => sql`(${id.repo}, ${id.number})`),
    sql`, `,
  )})`
  const rows = await q((tx) =>
    tx
      .update(alerts)
      .set(
        archived
          ? { archivedAt: new Date(), archivedBy: login, updatedAt: new Date() }
          : { archivedAt: null, archivedBy: null, updatedAt: new Date() },
      )
      .where(and(match, readableBy(login)))
      .returning({ number: alerts.number }),
  )
  return rows.length
}

export async function alertsByIds(login: string, ids: { repo: string; number: number }[]): Promise<AlertDoc[]> {
  if (ids.length === 0) return []
  const match = sql`(${alerts.repo}, ${alerts.number}) in (${sql.join(
    ids.map((id) => sql`(${id.repo}, ${id.number})`),
    sql`, `,
  )})`
  return q((tx) => tx.select().from(alerts).where(and(match, readableBy(login))))
}

export async function alertDetail(login: string, repo: string, number: number): Promise<AlertDoc | null> {
  const rows = await q((tx) =>
    tx.select().from(alerts).where(and(key(repo, number), readableBy(login))).limit(1),
  )
  return rows[0] ?? null
}

export type AlertPageDoc = { alerts: AlertDoc[]; total: number; hasMore: boolean }

export async function listAlerts(
  login: string,
  orgs: string[],
  paging: { skip: number; perPage: number },
  archived = false,
): Promise<AlertPageDoc> {
  const filter = and(
    readableBy(login),
    orgs.length > 0 ? inArray(alerts.org, orgs) : undefined,
    archived ? isNotNull(alerts.archivedAt) : isNull(alerts.archivedAt),
  )
  const [rows, counted] = await q((tx) =>
    Promise.all([
      tx.select().from(alerts).where(filter).orderBy(desc(alerts.createdAt)).offset(paging.skip).limit(paging.perPage),
      tx.select({ n: sql<number>`count(*)::int` }).from(alerts).where(filter),
    ]),
  )
  const total = counted[0]?.n ?? 0
  return { alerts: rows, total, hasMore: paging.skip + rows.length < total }
}

export type AlertCounts = {
  open: { severity: Severity; n: number }[]
  daily: { day: string; n: number }[]
}

// Open alerts by severity and alerts created per UTC day over the last `days` days.
export async function alertCounts(login: string, orgs: string[], days: number): Promise<AlertCounts> {
  const scope = and(readableBy(login), orgs.length > 0 ? inArray(alerts.org, orgs) : undefined)
  const day = sql<string>`to_char(${alerts.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`
  const [open, daily] = await q((tx) =>
    Promise.all([
      tx
        .select({ severity: alerts.severity, n: sql<number>`count(*)::int` })
        .from(alerts)
        .where(and(scope, eq(alerts.state, "open"), isNull(alerts.archivedAt)))
        .groupBy(alerts.severity),
      tx
        .select({ day, n: sql<number>`count(*)::int` })
        .from(alerts)
        .where(and(scope, sql`${alerts.createdAt} >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' - make_interval(days => ${days - 1})`))
        .groupBy(day),
    ]),
  )
  return { open, daily }
}

const SEVERITY_RANK = sql`array['low','medium','high','critical']`

// Model output may add to an alert, never take away: findings are appended and
// the severity only moves up. Returns the severity before and after.
export async function escalateAlert(
  repo: string,
  number: number,
  severity: Severity,
  findings: ScanFinding[],
): Promise<{ before: Severity; after: Severity } | null> {
  return q(async (tx) => {
    const [current] = await tx
      .select({ severity: alerts.severity })
      .from(alerts)
      .where(key(repo, number))
      .for("update")
    if (!current) return null
    const rows = await tx
      .update(alerts)
      .set({
        findings: sql`${alerts.findings} || ${JSON.stringify(findings)}::jsonb`,
        ruleIds: sql`array(select distinct unnest(${alerts.ruleIds} || ${sql.param(findings.map((f) => f.ruleId))}::text[]))`,
        severity: sql`case when array_position(${SEVERITY_RANK}, ${severity}::text) > array_position(${SEVERITY_RANK}, ${alerts.severity}) then ${severity} else ${alerts.severity} end`,
        updatedAt: new Date(),
      })
      .where(key(repo, number))
      .returning({ severity: alerts.severity })
    return { before: current.severity, after: rows[0]?.severity ?? current.severity }
  })
}
