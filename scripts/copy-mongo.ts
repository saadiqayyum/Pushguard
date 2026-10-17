import { MongoClient, type Document } from "mongodb"
import { sql } from "drizzle-orm"
import { asSystem } from "../lib/db/client"
import {
  addScanFiling,
  enqueueJob,
  grantRepoAccess,
  insertAiKey,
  insertAiRule,
  insertScan,
  recordAlert,
  saveRepo,
  setPackDisabled,
} from "../lib/db"
import { q } from "../lib/db/client"
import { alerts, installations, pullRequests, pushActors, rules } from "../lib/db/schema"

// One-shot copy of the Mongo database into Postgres. Derived projections that
// webhooks rebuild (code index, queues, review sessions, AI usage) are skipped;
// org membership is rebuilt by queuing a sync for every installation. Rules were
// keyed by the installing login, so an installer's rule set is copied to each org.
//
//   MONGODB_URI=... DATABASE_URL=... npx tsx --env-file-if-exists=.env scripts/copy-mongo.ts

const BATCH = 500

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error("MONGODB_URI is required")
  const mongo = new MongoClient(uri)
  const source = mongo.db()
  const all = (name: string) => source.collection<Document>(name).find().batchSize(BATCH)

  await asSystem(async () => {
    const orgsByInstaller = new Map<string, string[]>()
    for await (const doc of all("installations")) {
      orgsByInstaller.set(doc.installedBy, [...(orgsByInstaller.get(doc.installedBy) ?? []), doc.org])
      await q((tx) =>
        tx
          .insert(installations)
          .values({
            org: doc.org,
            installationId: doc.installationId,
            active: doc.active,
            repos: doc.repos ?? null,
            teams: doc.teams ?? null,
            accountType: doc.accountType ?? null,
            alertMention: doc.alertMention ?? null,
            aiDefaultKey: doc.aiDefaultKey ?? null,
            installedBy: doc.installedBy,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
          })
          .onConflictDoNothing(),
      )
      for (const key of doc.aiKeys ?? []) {
        await insertAiKey({
          id: key.id,
          org: doc.org,
          label: key.label,
          provider: key.provider,
          keyHint: key.keyHint,
          model: key.model,
          effort: key.effort,
          baseUrl: key.baseUrl ?? null,
          ciphertext: key.key.ciphertext,
          iv: key.key.iv,
          tag: key.key.tag,
          addedBy: key.addedBy,
          addedAt: key.addedAt,
        }).catch(() => undefined)
      }
      if (doc.active) {
        await enqueueJob({ type: "sync_org_members", installationId: doc.installationId, org: doc.org })
        if (doc.repos?.length) await enqueueJob({ type: "sync_repos", installationId: doc.installationId, repos: doc.repos })
      }
    }

    const orgsOf = (owner: string) => orgsByInstaller.get(owner) ?? []
    for await (const doc of all("rules")) {
      for (const org of orgsOf(doc.owner)) {
        await q((tx) =>
          tx
            .insert(rules)
            .values({ org, ruleId: doc.ruleId, body: doc.body, enabled: doc.enabled, createdBy: doc.createdBy, createdAt: doc.createdAt, updatedAt: doc.updatedAt })
            .onConflictDoNothing(),
        )
      }
    }
    for await (const doc of all("disabled_packs")) {
      for (const org of orgsOf(doc.owner)) await setPackDisabled(org, doc.pack, true, doc.disabledBy)
    }
    for await (const doc of all("ai_rules")) {
      for (const org of orgsOf(doc.owner)) {
        await insertAiRule({ org, ruleId: doc.ruleId, body: doc.body, enabled: doc.enabled, createdBy: doc.createdBy, createdAt: doc.createdAt, updatedAt: doc.updatedAt }).catch(() => undefined)
      }
    }

    for await (const doc of all("alerts")) {
      await recordAlert({
        repo: doc.repo,
        number: doc.number,
        url: doc.url,
        title: doc.title,
        severity: doc.severity,
        ruleIds: doc.ruleIds,
        findings: doc.findings ?? [],
        push: doc.push ?? null,
        pullRequest: doc.pullRequest ?? null,
        source: doc.source,
        createdAt: doc.createdAt,
      })
      const iso = <T,>(items: (T & { at: Date })[] | undefined) =>
        (items ?? []).map((item) => ({ ...item, at: new Date(item.at).toISOString() })) as never
      await q((tx) =>
        tx
          .update(alerts)
          .set({
            activity: iso(doc.activity),
            comments: iso(doc.comments),
            sightings: iso(doc.sightings),
            occurrences: doc.occurrences ?? 1,
            lastSeenAt: doc.lastSeenAt ?? doc.createdAt,
            state: doc.state ?? "open",
            acknowledgedAt: doc.acknowledgedAt ?? null,
            acknowledgedBy: doc.acknowledgedBy ?? null,
            assignees: doc.assignees ?? [],
            archivedAt: doc.archivedAt ?? null,
            archivedBy: doc.archivedBy ?? null,
          })
          .where(sql`repo = ${doc.repo} and number = ${doc.number}`),
      )
    }

    for await (const doc of all("repos")) {
      await saveRepo(String(doc._id), {
        defaultBranch: doc.defaultBranch ?? "main",
        branches: doc.branches ?? [],
        branchesTruncated: doc.branchesTruncated ?? false,
        archived: doc.archived ?? false,
        private: doc.private ?? null,
        syncedAt: doc.syncedAt ?? null,
      })
    }
    for await (const doc of all("repo_access")) {
      for (const grant of doc.grants ?? []) await grantRepoAccess(doc.login, doc.repo, doc.installationId, grant)
    }
    for await (const doc of all("push_actors")) {
      await q((tx) =>
        tx.insert(pushActors).values({ repo: doc.repo, sender: doc.sender, firstSeenAt: doc.firstSeenAt, pushes: doc.pushes }).onConflictDoNothing(),
      )
    }
    for await (const doc of all("pull_requests")) {
      const { _id, ...row } = doc
      void _id
      await q((tx) => tx.insert(pullRequests).values(row as typeof pullRequests.$inferInsert).onConflictDoNothing())
    }
    for await (const doc of all("scans")) {
      const { _id, filed, active, ...row } = doc
      void active
      const id = String(_id)
      await insertScan({ ...(row as Parameters<typeof insertScan>[0]), id, active: null }).catch(() => undefined)
      for (const entry of filed ?? []) await addScanFiling(id, entry)
    }
  })

  await mongo.close()
  const pg = (globalThis as unknown as { _pushguardDb?: { $client: { end: () => Promise<void> } } })._pushguardDb
  await pg?.$client.end()
  process.stdout.write("copy complete; org membership and repo access syncs queued\n")
}

main().catch((error: Error) => {
  process.stderr.write(`copy failed: ${error.message}\n`)
  process.exitCode = 1
})
