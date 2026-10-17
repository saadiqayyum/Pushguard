import picomatch from "picomatch"
import { EMPTY_SHA } from "@/lib/change-event"
import { enqueueJob, type InstallationDoc, type ScanFinding } from "@/lib/db"
import { checkDependencies, type AddedDependency, type DependencySignal } from "@/lib/dependencies"
import { dependenciesFromPatches } from "@/lib/dependency-diff"
import type { ChangedFile, RuleMatch } from "@/lib/engine"
import { env } from "@/lib/env"
import { toFinding } from "@/lib/finding"
import { fetchAddedDependencies } from "@/lib/github"
import { isWorkflowFile } from "@/lib/action-pins"
import { logger } from "@/lib/logger"
import type { PushDiff } from "@/lib/push-diff"
import { dispatchRunner, type DetonationRequest } from "@/lib/runner/dispatch"
import type { PushPayload } from "@/schemas/webhook"
import { DEPENDENCY_MANIFESTS, DETONATION_GATE } from "./limits"
import { RUNNER_DEADLINE_DELAY_SECONDS } from "./runner"

export const isManifest = picomatch(DEPENDENCY_MANIFESTS, { dot: true })

const DEPENDENCY_GRAPH_OFF = {
  id: "dependency-not-checked",
  severity: "low" as const,
  description: "Dependencies changed but could not be checked",
}

const SIGNAL_DESCRIPTIONS: Record<string, string> = {
  "dependency-known-malicious": "A dependency listed as malicious was added",
  "dependency-install-script": "An added dependency runs a script on install",
  "dependency-just-published": "An added dependency version is days old",
  "dependency-maintainer-changed": "An added dependency version has a new publisher",
  "dependency-not-checked": "Dependencies changed but could not be checked",
}

export function changesDependencies(payload: PushPayload, files: ChangedFile[]): boolean {
  return !payload.deleted && payload.before !== EMPTY_SHA && files.some((f) => isManifest(f.path))
}

// Read from the lockfile patches; GitHub's dependency graph is asked only for
// what a patch could not settle, or when the compare was cut short.
export async function dependencyFindings(
  installationId: number,
  payload: PushPayload,
  diff: PushDiff,
): Promise<{ findings: ScanFinding[]; signals: DependencySignal[] }> {
  const repo = payload.repository.full_name
  const fromPatches = dependenciesFromPatches(diff.files.filter((f) => isManifest(f.path)))
  let added: AddedDependency[] = fromPatches.added
  const unchecked: ScanFinding[] = []
  if (fromPatches.unread.length > 0 || diff.truncated) {
    const graph = await fetchAddedDependencies(installationId, repo, payload.before, payload.after)
    if (graph === null) {
      unchecked.push(
        toFinding(DEPENDENCY_GRAPH_OFF, repo, fromPatches.unread, [
          "The dependency graph is off for this repository and these manifests could not be read from the diff, so packages they added were not checked.",
        ], { prose: true }),
      )
    } else {
      const key = (d: AddedDependency) => [d.ecosystem.toLowerCase(), d.name, d.version].join("\0")
      const known = new Set(added.map(key))
      added = [...added, ...graph.filter((d) => !known.has(key(d)))]
    }
  }
  const signals = await checkDependencies(added)
  const findings = signals.map((signal) =>
    toFinding(
      { id: signal.id, severity: signal.severity, description: SIGNAL_DESCRIPTIONS[signal.id] ?? signal.id },
      repo,
      [signal.dependency.manifest],
      [`${signal.dependency.ecosystem}:${signal.dependency.name}@${signal.dependency.version} ${signal.detail}`],
      { prose: true },
    ),
  )
  return { findings: [...unchecked, ...findings], signals }
}

// Sends the push to the runner when a supply-chain rule fires or a rule asks to
// run a check. A deployment without RUNNER_REPO logs that, never files it.
export async function detonateIfGated(
  installation: InstallationDoc,
  payload: PushPayload,
  matches: RuleMatch[],
  signals: DependencySignal[],
  requested: DetonationRequest | null = null,
): Promise<void> {
  if (payload.deleted || payload.ref !== `refs/heads/${payload.repository.default_branch}`) return
  const gated =
    requested !== null ||
    matches.some((m) => (DETONATION_GATE as readonly string[]).includes(m.rule.id)) ||
    signals.some((s) => s.id !== "dependency-not-checked" && s.id !== "dependency-just-published")
  if (!gated) return

  const result = await dispatchRunner(
    installation.installationId,
    installation.org,
    payload.repository.full_name,
    payload.after,
    "detonate",
    env().AUTH_URL,
    requested ?? undefined,
  )
  if (result.status === "dispatched") {
    await enqueueJob({ type: "runner_deadline", jobId: result.jobId }, RUNNER_DEADLINE_DELAY_SECONDS)
  } else {
    logger.info("runner_not_configured", { org: installation.org, repo: payload.repository.full_name })
  }
}

// A new branch is measured against the default branch, so a pin it introduces is still checked.
export function changesPins(payload: PushPayload, files: ChangedFile[]): boolean {
  const base = payload.before === EMPTY_SHA ? payload.repository.default_branch : payload.before
  return !payload.deleted && Boolean(base) && payload.ref.startsWith("refs/heads/") && files.some((f) => isWorkflowFile(f.path))
}
