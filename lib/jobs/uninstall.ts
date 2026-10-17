import { deleteOrgData, installationExists } from "@/lib/db"
import { logger } from "@/lib/logger"
import { sendMetaAlert } from "@/lib/meta-alerts"
import { announce } from "@/lib/realtime"
import type { JobMessage } from "@/schemas/job"

type Uninstall = Extract<JobMessage, { type: "uninstall" }>

const DEPS = { exists: installationExists, alert: sendMetaAlert, wipe: deleteOrgData, announce }

// The meta-alert goes first: deleting the org removes the sinks it is sent to.
// Checked by installation id, so a repeat, or a reinstall in between, deletes nothing.
export async function uninstallOrg({ installationId, org, by }: Uninstall, deps = DEPS): Promise<void> {
  if (!(await deps.exists({ installationId }))) {
    logger.info("uninstall_skipped", { org, installationId })
    return
  }
  await deps.alert({
    type: "meta_alert",
    kind: "installation_deleted",
    org,
    lines: [`By @${by}. Pushes to ${org} are no longer watched, and its Pushguard data is being deleted.`],
  })
  const deleted = await deps.wipe(org)
  logger.warn("org_data_deleted", { org, installationId, by, deleted })
  await deps.announce(org, "installation")
}
