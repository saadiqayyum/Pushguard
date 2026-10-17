import { enqueueJob } from "@/lib/db"
import { logger } from "@/lib/logger"
import { notifySinks } from "@/lib/sinks"
import type { JobMessage } from "@/schemas/job"

export type MetaAlertKind = Extract<JobMessage, { type: "meta_alert" }>["kind"]

const TITLES: Record<MetaAlertKind, string> = {
  installation_deleted: "Pushguard was uninstalled",
  installation_suspend: "Pushguard was suspended",
  repo_removed: "Repositories were removed from Pushguard",
  alert_closed_by_actor: "An alert was closed by the account that triggered it",
  alert_deleted: "An alert issue was deleted",
  alert_unlabeled: "An alert issue lost its pushguard label",
  org_ruleset_changed: "An organization ruleset changed",
  delivery_missed: "A webhook never arrived",
  tag_repoint_chain: "A tj-actions-style chain: new member, flash branch, moved tag",
  rule_hit: "A rule matched",
}

// Pushguard losing sight of something, as opposed to something it saw. Goes
// out of band, because the in-repo issue is what the actor can close.
export async function metaAlert(kind: MetaAlertKind, org: string, lines: string[]): Promise<void> {
  logger.warn("meta_alert", { kind, org, lines })
  await enqueueJob({ type: "meta_alert", kind, org, lines: lines.slice(0, 10) })
}

export async function sendMetaAlert({ kind, org, lines }: Extract<JobMessage, { type: "meta_alert" }>): Promise<void> {
  const sent = await notifySinks(org, { severity: "critical", title: `${org}: ${TITLES[kind]}`, lines })
  logger.info("meta_alert_sent", { kind, org, sinks: sent })
}
