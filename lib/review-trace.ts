import { toFinding } from "@/lib/finding"
import type { ScanFinding } from "@/lib/db"
import type { ToolTrace } from "@/lib/review-tools"

// The blind spots and overreach one tool-using review leaves in its trace,
// reported the same way whichever review produced them.
export function traceFindings(repo: string, trace: ToolTrace): ScanFinding[] {
  const findings: ScanFinding[] = []
  if (trace.refused.length > 0) {
    findings.push(
      toFinding(
        {
          id: "ai-rule-left-its-scope",
          severity: "medium",
          description: "A model review asked for files outside the rule's own paths",
        },
        repo,
        [],
        trace.refused.slice(0, 5).map((r) => `${r.path}: ${r.reason}`),
        { prose: true },
      ),
    )
  }
  if (trace.truncated.length > 0) {
    findings.push(
      toFinding(
        { id: "file-not-fully-read", severity: "medium", description: "A file was too large to show the review in full" },
        repo,
        trace.truncated,
        ["A rule can only judge what it was shown; these files were cut."],
        { prose: true },
      ),
    )
  }
  if (trace.failed.length > 0) {
    findings.push(
      toFinding(
        { id: "review-tool-failed", severity: "medium", description: "A review tool could not answer, so the model worked without it" },
        repo,
        [],
        [`Unavailable during this review: ${trace.failed.join(", ")}.`],
        { prose: true },
      ),
    )
  }
  return findings
}
