import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { index, pgPolicy, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { app, appRole, q, systemAccess } from "./client"

export const MAX_FAILURE_REASON = 300
export const MAX_FAILURES_SHOWN = 5

// Background work that gave up, kept until the same work later succeeds, so the
// dashboard can say what Pushguard could not do instead of staying silent.
export const jobFailures = app
  .table(
    "job_failures",
    {
      id: uuid().primaryKey().defaultRandom(),
      org: text().notNull(),
      type: text().notNull(),
      subject: text().notNull(),
      reason: text().notNull(),
      failedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
      resolvedAt: timestamp({ withTimezone: true }),
    },
    (t) => [
      systemAccess("job_failures"),
      index().on(t.org, t.resolvedAt),
      pgPolicy("job_failures_member_read", { for: "select", to: appRole, using: sql`authz.is_member(org)` }),
    ],
  )
  .enableRLS()

export type JobFailure = typeof jobFailures.$inferSelect

export async function recordJobFailure(failure: { org: string; type: string; subject: string; reason: string }) {
  await q((tx) =>
    tx.insert(jobFailures).values({ ...failure, reason: failure.reason.slice(0, MAX_FAILURE_REASON) }),
  )
}

export async function resolveJobFailures(org: string, type: string, subject: string): Promise<void> {
  await q((tx) =>
    tx
      .update(jobFailures)
      .set({ resolvedAt: new Date() })
      .where(
        and(eq(jobFailures.org, org), eq(jobFailures.type, type), eq(jobFailures.subject, subject), isNull(jobFailures.resolvedAt)),
      ),
  )
}

export async function openJobFailures(orgs: string[]): Promise<JobFailure[]> {
  if (orgs.length === 0) return []
  return q((tx) =>
    tx
      .select()
      .from(jobFailures)
      .where(and(inArray(jobFailures.org, orgs), isNull(jobFailures.resolvedAt)))
      .orderBy(desc(jobFailures.failedAt))
      .limit(MAX_FAILURES_SHOWN),
  )
}

export async function countOpenJobFailures(orgs: string[]): Promise<number> {
  if (orgs.length === 0) return 0
  const rows = await q((tx) =>
    tx
      .select({ n: sql<number>`count(*)::int` })
      .from(jobFailures)
      .where(and(inArray(jobFailures.org, orgs), isNull(jobFailures.resolvedAt))),
  )
  return rows[0]?.n ?? 0
}
