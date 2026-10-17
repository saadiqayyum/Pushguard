import { activeInstallation } from "@/lib/db"
import { ownerOf, toFinding } from "@/lib/finding"
import { fileFindingsAlert } from "@/lib/findings-alert"
import type { JobMessage } from "@/schemas/job"

const DESCRIPTIONS = {
  "deploy-key-added": "A deploy key was added to this repository",
  "protection-weakened": "A branch protection rule or ruleset was edited",
  "protection-deleted": "A branch protection rule or ruleset was deleted",
} as const

export async function fileSettingsAlert({ repo, ruleId, severity, line }: Extract<JobMessage, { type: "settings_alert" }>) {
  const installation = await activeInstallation(ownerOf(repo))
  if (!installation) return
  const finding = toFinding({ id: ruleId, severity, description: DESCRIPTIONS[ruleId] }, repo, [], [line], { prose: true })
  await fileFindingsAlert({
    installationId: installation.installationId,
    repo,
    findings: [finding],
    source: "push",
    intro: `Repository settings changed on \`${repo}\`.`,
    repeat: line,
  })
}
