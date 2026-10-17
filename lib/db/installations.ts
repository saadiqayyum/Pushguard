import { and, asc, eq, inArray, or, sql } from "drizzle-orm"
import { bigint, boolean, integer, pgPolicy, text, timestamp } from "drizzle-orm/pg-core"
import { app, appRole, q, systemAccess } from "./client"

export type AiProvider = "anthropic" | "openai" | "google-genai"

// A stored key with the secret removed. The only shape that may leave the server.
export type PublicAiKey = {
  id: string
  label: string
  provider: AiProvider
  keyHint: string
  model: string
  effort: "low" | "medium" | "high"
  baseUrl?: string
  maxOutputTokens?: number
  thinkingBudget?: number
  timeoutMs?: number
}

export const installations = app
  .table(
    "installations",
    {
      org: text().primaryKey(),
      installationId: bigint({ mode: "number" }).notNull().unique(),
      active: boolean().notNull().default(true),
      repos: text().array(),
      teams: text().array(),
      accountType: text().$type<"User" | "Organization">(),
      alertMention: text(),
      aiDefaultKey: text(),
      aiDailyTokenBudget: integer(),
      aiPushTokenBudget: integer(),
      indicatorBranches: text().array(),
      installedBy: text().notNull(),
      createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    () => [systemAccess("installations"), 
      pgPolicy("installations_reach", {
        for: "select",
        to: appRole,
        using: sql`authz.is_member(org) or authz.reaches_installation(installation_id)`,
      }),
      pgPolicy("installations_admin_update", {
        for: "update",
        to: appRole,
        using: sql`authz.is_admin(org)`,
        withCheck: sql`authz.is_admin(org)`,
      }),
    ],
  )
  .enableRLS()

export type InstallationDoc = typeof installations.$inferSelect

const live = eq(installations.active, true)

export async function installationById(installationId: number): Promise<InstallationDoc | null> {
  const rows = await q((tx) =>
    tx.select().from(installations).where(and(eq(installations.installationId, installationId), live)).limit(1),
  )
  return rows[0] ?? null
}

export async function activeInstallation(org: string): Promise<InstallationDoc | null> {
  const rows = await q((tx) =>
    tx.select().from(installations).where(and(eq(installations.org, org), live)).limit(1),
  )
  return rows[0] ?? null
}

export async function updateInstallation(
  org: string,
  patch: Partial<Omit<InstallationDoc, "org" | "createdAt">>,
): Promise<void> {
  await q((tx) =>
    tx
      .update(installations)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(installations.org, org)),
  )
}

export async function addInstallationRepos(org: string, repos: string[]): Promise<void> {
  if (repos.length === 0) return
  await q((tx) =>
    tx
      .update(installations)
      .set({
        repos: sql`array(select distinct unnest(coalesce(${installations.repos}, '{}') || ${sql.param(repos)}::text[]))`,
        updatedAt: new Date(),
      })
      .where(eq(installations.org, org)),
  )
}

export async function removeInstallationRepos(org: string, repos: string[]): Promise<void> {
  if (repos.length === 0) return
  await q((tx) =>
    tx
      .update(installations)
      .set({
        repos: sql`array(select r from unnest(${installations.repos}) r where r <> all(${sql.param(repos)}::text[]))`,
        updatedAt: new Date(),
      })
      .where(eq(installations.org, org)),
  )
}

// Any state, suspended included: false only once the org's data is gone.
export async function installationExists(where: { org: string } | { installationId: number }): Promise<boolean> {
  const match = "org" in where ? eq(installations.org, where.org) : eq(installations.installationId, where.installationId)
  const rows = await q((tx) => tx.select({ org: installations.org }).from(installations).where(match).limit(1))
  return rows.length > 0
}

export async function activeInstallations(orgs: string[]): Promise<InstallationDoc[]> {
  if (orgs.length === 0) return []
  return q((tx) =>
    tx.select().from(installations).where(and(inArray(installations.org, orgs), live)).orderBy(asc(installations.org)),
  )
}

// An unsuspend revives the row. Who installed it, and the mention, stay first-write.
export async function registerInstallation(row: {
  org: string
  installationId: number
  accountType: "User" | "Organization"
  installedBy: string
  repos?: string[]
}): Promise<InstallationDoc> {
  const { installedBy, ...fields } = row
  const revived = { ...fields, active: true, updatedAt: new Date() }
  const rows = await q((tx) =>
    tx
      .insert(installations)
      .values({ ...revived, installedBy, alertMention: `@${installedBy}` })
      .onConflictDoUpdate({ target: installations.org, set: revived })
      .returning(),
  )
  return rows[0]
}

export async function setInstallationTeam(org: string, slug: string, present: boolean, previous?: string) {
  const drop = [slug, ...(previous ? [previous] : [])]
  const kept = sql`array(select t from unnest(coalesce(${installations.teams}, '{}')) t where t <> all(${sql.param(drop)}::text[]))`
  await q((tx) =>
    tx
      .update(installations)
      .set({ teams: present ? sql`${kept} || array[${slug}]::text[]` : kept, updatedAt: new Date() })
      .where(eq(installations.org, org)),
  )
}

// What a signed-in user can open: orgs they belong to, and installations they
// reach as a collaborator. RLS applies the same rule underneath.
export async function reachableInstallations(orgs: string[], installationIds: number[]): Promise<InstallationDoc[]> {
  if (orgs.length === 0 && installationIds.length === 0) return []
  return q((tx) =>
    tx
      .select()
      .from(installations)
      .where(
        and(
          live,
          or(
            orgs.length > 0 ? inArray(installations.org, orgs) : undefined,
            installationIds.length > 0 ? inArray(installations.installationId, installationIds) : undefined,
          ),
        ),
      )
      .orderBy(asc(installations.org)),
  )
}

// Branches, beyond the default, whose pushes get line-level indicator checks.
export async function setIndicatorBranches(org: string, branches: string[]): Promise<void> {
  await q((tx) =>
    tx
      .update(installations)
      .set({ indicatorBranches: branches.length > 0 ? branches : null, updatedAt: new Date() })
      .where(eq(installations.org, org)),
  )
}
