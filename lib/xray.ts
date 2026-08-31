import { AstAnalyser } from "@nodesecure/js-x-ray"
import { toFinding } from "@/lib/finding"
import { fetchBlobs } from "@/lib/github"
import { logger } from "@/lib/logger"
import { JS_FILE } from "@/lib/source-files"
import type { ScanFinding } from "@/lib/db"
import type { ChangedFile } from "@/lib/engine"
import type { Severity } from "@/schemas/rule"

// AST analysis of changed JavaScript, for the attacks a line cannot describe.

// One call per file, so this is the blast radius of a push touching everything.
const MAX_FILES = 15

// Above this, a file is a bundle or vendored, and analysing it says nothing.
const MAX_FILE_BYTES = 1_000_000

// How seriously to take each finding.
const SEVERITY: Record<string, Severity> = {
  "serialize-environment": "critical",
  "shady-link": "high",
  "unsafe-import": "high",
  "unsafe-regex": "medium",
  "unsafe-stmt": "high",
  "encoded-literal": "medium",
  "obfuscated-code": "critical",
  "suspicious-literal": "medium",
  "suspicious-file": "high",
  "weak-crypto": "low",
}

const DESCRIPTION: Record<string, string> = {
  "serialize-environment": "The process environment is packaged up, which is how credentials leave",
  "shady-link": "A network address written as a raw IP or a suspicious host",
  "unsafe-import": "A module resolved from a value rather than a literal",
  "unsafe-regex": "A regular expression that can be made to hang",
  "unsafe-stmt": "Code built and executed at runtime",
  "encoded-literal": "An encoded string literal, which hides what it says",
  "obfuscated-code": "Deliberately unreadable code",
  "suspicious-literal": "A literal with the shape of a hidden payload",
  "suspicious-file": "A file whose structure matches known malicious packages",
  "weak-crypto": "A broken hashing or cipher primitive",
}

export async function analyseChangedJavaScript(
  installationId: number,
  repo: string,
  sha: string,
  files: ChangedFile[],
): Promise<ScanFinding[]> {
  const targets = files
    .filter((file) => file.changeType !== "removed" && JS_FILE.test(file.path))
    .slice(0, MAX_FILES)
  if (targets.length === 0) return []

  const analyser = new AstAnalyser()
  const findings: ScanFinding[] = []

  let sources: Map<string, string>
  try {
    sources = (await fetchBlobs(installationId, repo, sha, targets.map((f) => f.path))).files
  } catch (error) {
    logger.warn("xray_fetch_failed", { repo, error: String(error) })
    return []
  }

  for (const file of targets) {
    const source = sources.get(file.path) ?? null
    if (source === null || source.length > MAX_FILE_BYTES) continue

    let warnings
    try {
      warnings = (await analyser.analyse(source)).warnings
    } catch {
      continue
    }

    for (const warning of warnings) {
      const severity = SEVERITY[warning.kind]
      if (!severity) continue
      findings.push(
        toFinding(
          { id: `xray-${warning.kind}`, severity, description: DESCRIPTION[warning.kind] },
          repo,
          [file.path],
          [String(warning.value ?? warning.kind)],
        ),
      )
    }
  }

  if (findings.length > 0) {
    logger.info("xray_findings", {
      repo,
      sha,
      files: targets.length,
      kinds: [...new Set(findings.map((f) => f.ruleId))],
    })
  }
  return findings
}
