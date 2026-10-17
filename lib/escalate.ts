import { escalateAlert, type ScanFinding } from "@/lib/db"
import { findingsMarkdown, topSeverity } from "@/lib/finding"
import { addIssueLabels, commentOnIssue } from "@/lib/github"
import { logger } from "@/lib/logger"

export type FiledRef = { target: string; number: number; redact: boolean }

// Escalate-only: append findings, raise severity, comment. Never close or lower.
export async function escalateOnto(installationId: number, ref: FiledRef, heading: string, findings: ScanFinding[]): Promise<void> {
  if (findings.length === 0) return
  const severity = topSeverity(findings.map((f) => f.severity))
  const changed = await escalateAlert(ref.target, ref.number, severity, findings)
  if (!changed) return
  await commentOnIssue(installationId, ref.target, ref.number, [`### ${heading}`, "", ...findingsMarkdown(findings, ref.redact)].join("\n"))
  if (changed.after !== changed.before) {
    await addIssueLabels(installationId, ref.target, ref.number, [`severity:${changed.after}`])
  }
  logger.info("alert_escalated", { target: ref.target, issue: ref.number, heading, before: changed.before, after: changed.after })
}
