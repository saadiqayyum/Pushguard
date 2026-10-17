import { assigneesFor } from "@/lib/alerts"
import { activeInstallation, recordAlert } from "@/lib/db"
import { ownerOf } from "@/lib/finding"
import { createAlertIssue } from "@/lib/github"
import { logger } from "@/lib/logger"
import { notifySinks } from "@/lib/sinks"
import type { JobMessage } from "@/schemas/job"

// A private repository was made public.
export async function filePublicAlert({ repo, sender }: Extract<JobMessage, { type: "public_alert" }>) {
  const installation = await activeInstallation(ownerOf(repo))
  if (!installation) return

  const title = `[critical] ${repo}: repository made public`
  const issue = await createAlertIssue(
    installation.installationId,
    repo,
    title,
    [
      installation.alertMention
        ? `${installation.alertMention}. A private repository is now public.`
        : "A private repository is now public.",
      "",
      "| | |",
      "|---|---|",
      `| Repository | ${repo} |`,
      `| Changed by | @${sender} |`,
      `| At | ${new Date().toISOString()} |`,
      "",
      "Everything in this repository's history is now readable by anyone, including any",
      "credential ever committed to it. Making it private again does not un-publish what",
      "was fetched, forked or indexed in the meantime.",
      "",
      `[Repository settings](https://github.com/${repo}/settings)`,
    ].join("\n"),
    ["pushguard", "severity:critical", "visibility"],
    assigneesFor(installation.alertMention),
  )
  await recordAlert({
    repo,
    number: issue.number,
    url: issue.html_url,
    title,
    severity: "critical",
    ruleIds: ["repository-made-public"],
    findings: [],
    source: "push",
    createdAt: new Date(),
  })
  logger.info("visibility_alert_created", { repo, by: sender, issue: issue.number })
  await notifySinks(installation.org, {
    severity: "critical",
    title,
    url: issue.html_url,
    lines: [`Made public by @${sender}`],
  }).catch((error: unknown) => logger.error("sink_notify_failed", { repo, error: String(error) }))
}
