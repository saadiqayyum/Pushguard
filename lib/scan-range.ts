export type ScanRange =
  | { kind: "single"; ref: string }
  | { kind: "compare"; base: string; head: string }
  | { kind: "root"; root: string; head: string }

// Which range a scan should read, given the commit window newest-first.
//
// A compare reports what changed AFTER its base, so using the oldest commit in
// the window as the base hides everything that commit introduced. On a
// repository shorter than the window that is the initial commit, usually the
// largest one, and the scan called it clean.
export function scanRange(
  commits: { sha: string; parents?: { sha?: string }[] }[],
): ScanRange | null {
  if (commits.length === 0) return null
  const head = commits[0].sha
  if (commits.length === 1) return { kind: "single", ref: head }

  const oldest = commits.at(-1)!
  const parent = oldest.parents?.[0]?.sha
  // Diff from the parent so the oldest commit's own changes are included.
  if (parent) return { kind: "compare", base: parent, head }
  // No parent: the window reached the root, which only a direct read can show.
  return { kind: "root", root: oldest.sha, head }
}
