import { resolveAlertTarget } from "@/lib/alert-target"
import { fileOrThreadAlert } from "@/lib/alerts"
import { openAlertForRules, repoRecord, type AlertDoc, type ScanFinding } from "@/lib/db"
import { findingsMarkdown, topSeverity } from "@/lib/finding"

// One alert for a batch of findings about one repository, threaded onto an open
// alert for the same rules when there is one.
export async function fileFindingsAlert(input: {
  installationId: number
  repo: string
  findings: ScanFinding[]
  source: AlertDoc["source"]
  intro: string
  repeat: string
}): Promise<void> {
  if (input.findings.length === 0) return
  const stored = await repoRecord(input.repo)
  const target = resolveAlertTarget(input.repo, stored?.private ?? false)
  const severity = topSeverity(input.findings.map((f) => f.severity))
  const ruleIds = [...new Set(input.findings.map((f) => f.ruleId))]
  await fileOrThreadAlert({
    installationId: input.installationId,
    target: target.repo,
    severity,
    ruleIds,
    findings: input.findings,
    source: input.source,
    title: `[${severity}] ${input.repo}: ${ruleIds.join(", ")}`,
    body: [input.intro, "", "### Findings", ...findingsMarkdown(input.findings, target.redactContent)].join("\n"),
    repeat: input.repeat,
  })
}

// Posture and blind-spot findings that re-evaluate often: filed when no alert
// for the rule is open, and silent while one is, so a re-check is not a comment.
export async function fileFindingOnce(installationId: number, repo: string, finding: ScanFinding, intro: string): Promise<void> {
  if (await openAlertForRules(repo, [finding.ruleId])) return
  await fileFindingsAlert({ installationId, repo, findings: [finding], source: "push", intro, repeat: intro })
}
