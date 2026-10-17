import picomatch from "picomatch"
import { FIRST_PARTY_ACTION_OWNERS } from "@/lib/ci-limits"

export type ActionRef = { repo: string; path: string; ref: string; pinned: boolean }
export type PinChanges = { checks: ActionRef[]; downgrades: { from: ActionRef; to: ActionRef }[] }

export const isWorkflowFile = picomatch([".github/workflows/**/*.{yml,yaml}", "**/action.{yml,yaml}"], { dot: true })

const USES = /^\s*-?\s*uses\s*:\s*["']?([^"'\s#]+)/
const REMOTE = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)((?:\/[^@\s]*)?)@([^\s]+)$/
const FULL_SHA = /^[0-9a-f]{40}$/i

// `owner/repo[/path]@ref` from one workflow line. Local (`./`) and docker
// references are not actions anyone can repoint, so they are null.
export function parseUses(line: string): ActionRef | null {
  const target = USES.exec(line)?.[1]
  const match = target ? REMOTE.exec(target) : null
  if (!match) return null
  const [, owner, name, path, ref] = match
  return { repo: `${owner}/${name}`.toLowerCase(), path: path.toLowerCase(), ref, pinned: FULL_SHA.test(ref) }
}

export const usesAny = (lines: string[]) => lines.some((line) => USES.test(line))

export const isThirdParty = (action: ActionRef) => !FIRST_PARTY_ACTION_OWNERS.includes(action.repo.split("/")[0])

// What a diff did to action pins. A pinned SHA that is new or different is
// checked; a pin replaced by a tag or branch for the same action is a downgrade.
export function pinChanges(removedLines: string[], addedLines: string[]): PinChanges {
  const removed = removedLines.map(parseUses).filter((a) => a !== null)
  const added = addedLines.map(parseUses).filter((a) => a !== null)
  const key = (a: ActionRef) => `${a.repo}${a.path}`
  const before = new Set(removed.filter((a) => a.pinned).map((a) => `${key(a)}@${a.ref.toLowerCase()}`))
  const seen = new Set<string>()
  const checks = added.filter((a) => {
    const id = `${key(a)}@${a.ref.toLowerCase()}`
    if (!a.pinned || before.has(id) || seen.has(id)) return false
    seen.add(id)
    return true
  })
  const stillPinned = new Set(added.filter((a) => a.pinned).map(key))
  const downgrades = added.flatMap((to) => {
    const from = to.pinned || stillPinned.has(key(to)) ? undefined : removed.find((r) => r.pinned && key(r) === key(to))
    return from ? [{ from, to }] : []
  })
  return { checks, downgrades }
}

export type Reachability = "reachable" | "unreachable"

// A compare of `{default}...{sha}`: behind or identical means the SHA is in
// the default branch's history. Null status is a 404, a SHA the repo never had.
export function reachabilityOf(status: string | null, onTag: boolean): Reachability {
  if (status === "behind" || status === "identical" || onTag) return "reachable"
  return "unreachable"
}

// A cached verdict still inside its TTL, or null when it must be asked again.
export function freshVerdict(cached: { reachable: boolean; checkedAt: Date } | null, now: Date, ttlHours: { reachable: number; unreachable: number }): Reachability | null {
  if (!cached) return null
  const ttl = (cached.reachable ? ttlHours.reachable : ttlHours.unreachable) * 3_600_000
  if (now.getTime() - cached.checkedAt.getTime() >= ttl) return null
  return cached.reachable ? "reachable" : "unreachable"
}
