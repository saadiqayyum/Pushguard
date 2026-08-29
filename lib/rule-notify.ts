import { after } from "next/server"
import { assigneesFor } from "@/lib/alerts"
import { ownerInstallation } from "@/lib/db"
import { createAlertIssue } from "@/lib/github"
import { logger } from "@/lib/logger"

// Rule changes are themselves alerts: a compromised account disabling
// detection must not go unnoticed.
export function notifyRuleChange(owner: string, action: string, ruleId: string, by: string): void {
  after(async () => {
    try {
      const installation = await ownerInstallation(owner)
      // Rule changes belong to no single repo, so they need an explicit home.
      if (!installation?.alertsRepo) {
        logger.warn("rule_change_notify_skipped_no_alerts_repo", { owner, ruleId })
        return
      }
      await createAlertIssue(
        installation.installationId,
        installation.alertsRepo,
        `[rule-change] ${ruleId} ${action} by @${by}`,
        `Rule \`${ruleId}\` was ${action} by @${by}. If this change is unexpected, treat it as an incident.`,
        ["pushguard", "rule-change"],
        assigneesFor(installation.alertMention),
      )
    } catch (error) {
      logger.error("rule_change_notify_failed", {
        ruleId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
}
