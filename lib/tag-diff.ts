import type { TagRef } from "@/lib/github-refs"

export type TagMoveGroup = { sha: string; tags: { tag: string; from: string }[] }

// Tags whose commit changed since the stored snapshot, grouped by new target,
// largest group first. Nothing stored is a first snapshot: it only records.
export function diffTags(stored: Map<string, string>, current: TagRef[]): { first: boolean; groups: TagMoveGroup[] } {
  if (stored.size === 0) return { first: true, groups: [] }
  const groups = new Map<string, TagMoveGroup>()
  for (const { tag, sha } of current) {
    const from = stored.get(tag)
    if (!from || from === sha) continue
    const group = groups.get(sha) ?? { sha, tags: [] }
    group.tags.push({ tag, from })
    groups.set(sha, group)
  }
  return { first: false, groups: [...groups.values()].sort((a, b) => b.tags.length - a.tags.length) }
}

const FLOATING = /^v?\d+(\.\d+)?$/
const FULL_VERSION = /^v?\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/

// The routine release pattern: only floating tags (v1, v1.4) moved, onto the
// commit a full version tag published in the same snapshot points at. The
// caller still requires that commit to be on the default branch.
export function isRoutineRelease(group: TagMoveGroup, current: TagRef[], stored: Map<string, string>): boolean {
  if (!group.tags.every((t) => FLOATING.test(t.tag))) return false
  return current.some((t) => t.sha === group.sha && FULL_VERSION.test(t.tag) && !stored.has(t.tag))
}
