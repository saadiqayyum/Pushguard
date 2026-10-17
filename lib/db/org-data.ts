import { eq, getTableName, like, type SQL } from "drizzle-orm"
import type { PgColumn, PgTable } from "drizzle-orm/pg-core"
import { repoAccess } from "./access"
import { aiKeys } from "./ai-keys"
import { pendingAiReviews } from "./ai-reviews"
import { aiRules, aiUsage } from "./ai"
import { alertSinks } from "./alert-sinks"
import { alerts } from "./alerts"
import { chainEvents } from "./chain-events"
import { q } from "./client"
import { codeFacts } from "./code-facts"
import { codeIndex } from "./code-index"
import { codeSymbols } from "./code-symbols"
import { dependencyInventory } from "./dependency-inventory"
import { installations } from "./installations"
import { jobFailures } from "./job-failures"
import { mcpTokens } from "./mcp-tokens"
import { mergedCommits } from "./merged-commits"
import { orgMembers } from "./org-members"
import { pullRequests } from "./pull-requests"
import { repoLocks } from "./repo-locks"
import { pushActors, repos } from "./repos"
import { reviewSessions } from "./review-sessions"
import { ruleShadowHits } from "./rule-shadow-hits"
import { disabledPacks, rules, ruleVersions } from "./rules"
import { runnerJobs } from "./runner-jobs"
import { scans } from "./scans"
import { tagSnapshots } from "./tag-snapshots"

type Scoped = [PgTable, PgColumn, "org" | "repo"]

const where = ([, column, key]: Scoped, org: string): SQL =>
  key === "org" ? eq(column, org) : like(column, `${org.replace(/[\\%_]/g, "\\$&")}/%`)

// Every tenant table, keyed by org or by "org/repo". Global tables (threat
// intel, platform rules and audit, contributor drafts, pin verdicts, deliveries) are not org data.
export const ORG_TABLES: Scoped[] = [
  [alerts, alerts.org, "org"],
  [scans, scans.account, "org"],
  [repos, repos.org, "org"],
  [repoAccess, repoAccess.org, "org"],
  [pushActors, pushActors.repo, "repo"],
  [pullRequests, pullRequests.org, "org"],
  [mergedCommits, mergedCommits.repo, "repo"],
  [reviewSessions, reviewSessions.org, "org"],
  [pendingAiReviews, pendingAiReviews.repo, "repo"],
  [dependencyInventory, dependencyInventory.repo, "repo"],
  [codeIndex, codeIndex.repo, "repo"],
  [codeSymbols, codeSymbols.repo, "repo"],
  [codeFacts, codeFacts.repo, "repo"],
  [tagSnapshots, tagSnapshots.repo, "repo"],
  [chainEvents, chainEvents.org, "org"],
  [repoLocks, repoLocks.repo, "repo"],
  [ruleShadowHits, ruleShadowHits.repo, "repo"],
  [rules, rules.org, "org"],
  [ruleVersions, ruleVersions.org, "org"],
  [disabledPacks, disabledPacks.org, "org"],
  [aiRules, aiRules.org, "org"],
  [aiKeys, aiKeys.org, "org"],
  [aiUsage, aiUsage.org, "org"],
  [mcpTokens, mcpTokens.org, "org"],
  [alertSinks, alertSinks.org, "org"],
  [jobFailures, jobFailures.org, "org"],
  [runnerJobs, runnerJobs.org, "org"],
  [orgMembers, orgMembers.org, "org"],
  [installations, installations.org, "org"],
]

// Uninstall and privacy requests. One transaction: either every row goes or none does.
export async function deleteOrgData(org: string): Promise<Record<string, number>> {
  return q(async (tx) => {
    const counts: Record<string, number> = {}
    for (const scoped of ORG_TABLES) {
      const result = await tx.delete(scoped[0]).where(where(scoped, org))
      counts[getTableName(scoped[0])] = result.count
    }
    return counts
  })
}
