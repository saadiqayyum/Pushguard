import { MongoClient, type Collection, type Db } from "mongodb"
import { env } from "@/lib/env"
import type { Rule } from "@/schemas/rule"

export type RuleDoc = {
  _id: string
  // The account the rule set belongs to (an installation's installedBy), not a
  // single org: one rule set applies to every org that account installed on.
  // Per-org narrowing is expressed inside the rule with `repos`.
  owner: string
  ruleId: string
  body: Rule
  enabled: boolean
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export type RuleVersionDoc = {
  _id: string
  ruleId: string
  body: Rule
  action: "created" | "updated" | "enabled" | "disabled"
  changedBy: string
  changedAt: Date
}

export type InstallationDoc = {
  _id: string
  org: string
  installationId: number
  active: boolean
  // Repos the app is installed on, kept fresh by installation webhooks so the
  // dashboard never has to ask GitHub. undefined = never populated (pre-webhook
  // install), which triggers a one-time backfill in resolveTenant.
  repos?: string[]
  // Team slugs as `org/team`, for the alert-mention picker. Always [] on a
  // personal account: no teams exist there.
  teams?: string[]
  accountType?: "User" | "Organization"
  // Optional override. Null means alerts are filed in the repo that triggered them.
  alertsRepo: string | null
  alertMention: string | null
  installedBy: string
  createdAt: Date
  updatedAt: Date
}

let clientPromise: Promise<MongoClient> | null = null
let indexed = false

async function connect(): Promise<Db> {
  clientPromise ??= new MongoClient(env().MONGODB_URI).connect()
  const db = (await clientPromise).db()
  if (!indexed) {
    indexed = true
    // Index creation must never take the app down: a failed build (a pending
    // migration, a pre-existing duplicate) would otherwise make every query
    // throw. Log loudly and carry on — uniqueness is also enforced at write time.
    await Promise.all(
      [
        db.collection("rules").createIndex({ owner: 1, enabled: 1 }),
        db.collection("rules").createIndex({ owner: 1, ruleId: 1 }, { unique: true }),
        db.collection("rule_versions").createIndex({ ruleId: 1 }),
        db.collection("installations").createIndex({ org: 1 }, { unique: true }),
      ].map((p) =>
        p.catch((error: unknown) => {
          console.error(
            JSON.stringify({
              level: "error",
              message: "index_create_failed",
              error: error instanceof Error ? error.message : String(error),
            }),
          )
        }),
      ),
    )
  }
  return db
}

export async function rulesCollection(): Promise<Collection<RuleDoc>> {
  return (await connect()).collection<RuleDoc>("rules")
}

export async function ruleVersionsCollection(): Promise<Collection<RuleVersionDoc>> {
  return (await connect()).collection<RuleVersionDoc>("rule_versions")
}

export async function installationsCollection(): Promise<Collection<InstallationDoc>> {
  return (await connect()).collection<InstallationDoc>("installations")
}

export async function activeInstallation(org: string): Promise<InstallationDoc | null> {
  return (await installationsCollection()).findOne({ org, active: true })
}

// Somewhere to file an owner-level notice. Prefer an installation that has a
// configured alerts repo; otherwise any active one will do.
export async function ownerInstallation(owner: string): Promise<InstallationDoc | null> {
  const collection = await installationsCollection()
  return (
    (await collection.findOne({ installedBy: owner, active: true, alertsRepo: { $ne: null } })) ??
    (await collection.findOne({ installedBy: owner, active: true }))
  )
}

export function serializeRule(doc: RuleDoc) {
  return {
    id: doc._id,
    ruleId: doc.ruleId,
    body: doc.body,
    enabled: doc.enabled,
    createdBy: doc.createdBy,
    updatedAt: doc.updatedAt.toISOString(),
  }
}

export function serializeInstallation(doc: InstallationDoc) {
  return {
    org: doc.org,
    active: doc.active,
    repos: doc.repos ?? [],
    teams: doc.teams ?? [],
    alertsRepo: doc.alertsRepo,
    alertMention: doc.alertMention,
  }
}
