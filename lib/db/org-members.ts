import { and, eq, sql } from "drizzle-orm"
import { pgPolicy, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import { app, appRole, q, systemAccess } from "./client"

export type OrgRole = "admin" | "member"

// Org membership and role, from the install and the organization webhook. A
// personal account is stored as its own admin.
export const orgMembers = app
  .table(
    "org_members",
    {
      org: text().notNull(),
      login: text().notNull(),
      role: text().$type<OrgRole>().notNull(),
      updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [systemAccess("org_members"), 
      primaryKey({ columns: [t.org, t.login] }),
      pgPolicy("org_members_own", { for: "select", to: appRole, using: sql`login = authz.current_login()` }),
    ],
  )
  .enableRLS()

export async function upsertOrgMember(org: string, login: string, role: OrgRole): Promise<void> {
  await q((tx) =>
    tx
      .insert(orgMembers)
      .values({ org, login: login.toLowerCase(), role })
      .onConflictDoUpdate({ target: [orgMembers.org, orgMembers.login], set: { role, updatedAt: new Date() } }),
  )
}

export async function replaceOrgMembers(org: string, members: { login: string; role: OrgRole }[]): Promise<void> {
  await q(async (tx) => {
    await tx.delete(orgMembers).where(eq(orgMembers.org, org))
    if (members.length === 0) return
    await tx
      .insert(orgMembers)
      .values(members.map(({ login, role }) => ({ org, login: login.toLowerCase(), role })))
      .onConflictDoNothing()
  })
}

export async function removeOrgMember(org: string, login: string): Promise<void> {
  await q((tx) =>
    tx.delete(orgMembers).where(and(eq(orgMembers.org, org), eq(orgMembers.login, login.toLowerCase()))),
  )
}

export async function membershipsOf(login: string): Promise<{ org: string; role: OrgRole }[]> {
  return q((tx) =>
    tx
      .select({ org: orgMembers.org, role: orgMembers.role })
      .from(orgMembers)
      .where(eq(orgMembers.login, login.toLowerCase())),
  )
}
