import { fetchInstallationDetails } from "@/lib/github"
import { logger } from "@/lib/logger"
import { registerAndSync } from "@/lib/webhook/installation"
import type { JobMessage } from "@/schemas/job"

// Sign-in found an installation we never recorded. The App's own credentials
// confirm it exists and is ours before anything is written.
export async function registerMissedInstallation({
  installationId,
  installedBy,
}: Extract<JobMessage, { type: "register_installation" }>): Promise<void> {
  const details = await fetchInstallationDetails(installationId)
  if (details.suspended || !details.account) {
    logger.info("installation_not_registered", { installationId, suspended: details.suspended })
    return
  }
  await registerAndSync({
    org: details.account,
    installationId,
    accountType: details.accountType,
    installedBy,
    repos: details.repos,
  })
}
