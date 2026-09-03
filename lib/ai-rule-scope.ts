// Own module so it stays testable: lib/ai-rules.ts pulls in Octokit to read.
import picomatch from "picomatch"
import { SOURCE_FILE } from "@/lib/source-files"
import { matchesWhen, runsOn } from "@/lib/engine"
import type { AiRule } from "@/schemas/ai-rule"
import type { ChangedFile, PushContext } from "@/lib/engine"

// One request per rule per push. This bounds the worst push, not the usual one.
export const MAX_FILES_PER_RULE = 10

// Per file, and across every file one rule sends.
export const MAX_CHARS_PER_FILE = 40_000
export const MAX_TOTAL_CHARS = 120_000

// How much of this file fits in what is left.
export function fitToBudget(source: string, remaining: number): string {
  return source.slice(0, Math.min(MAX_CHARS_PER_FILE, Math.max(0, remaining)))
}

// Names of files the push also touched, sent as context with no content.
const MAX_CONTEXT_PATHS = 40
const MAX_CONTEXT_CHARS = 4_000

// The "also changed, but not shown" list, bounded by length as well as count.
export function contextPaths(paths: string[]): string[] {
  const listed: string[] = []
  let budget = MAX_CONTEXT_CHARS
  for (const path of paths.slice(0, MAX_CONTEXT_PATHS)) {
    if (path.length > budget) break
    budget -= path.length
    listed.push(path)
  }
  return listed
}

// Which files a rule reads on this push.
export function filesForRule(
  rule: AiRule,
  repo: string,
  branch: string,
  changed: ChangedFile[],
  // Absent on a scan, which has no push event. A rule that asks about one is
  // then dropped rather than matched on an unknown, the same way the pattern
  // engine drops `when` rules from a scan.
  context?: PushContext,
): string[] {
  if (!runsOn(rule, context ?? {})) return []
  if (rule.repos && !picomatch(rule.repos, { dot: true })(repo)) return []
  if (rule.branches && !picomatch(rule.branches, { dot: true })(branch)) return []
  if (rule.when && (!context || !matchesWhen(rule.when, context))) return []

  const include = rule.paths ? picomatch(rule.paths, { dot: true }) : null
  const exclude = rule.exclude_paths ? picomatch(rule.exclude_paths, { dot: true }) : null

  return changed
    .filter((file) => file.changeType !== "removed")
    .map((file) => file.path)
    .filter((path) => SOURCE_FILE.test(path))
    .filter((path) => (include ? include(path) : true))
    .filter((path) => !exclude?.(path))
    .slice(0, MAX_FILES_PER_RULE)
}

