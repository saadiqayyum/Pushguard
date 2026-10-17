import { posix } from "node:path"
import type { AddedDependency } from "@/lib/dependencies"
import { parseHunks } from "@/lib/diff-lines"
import { isLockfile, parseLockfileFragment, type LockedPackage } from "@/lib/lockfiles"

type PatchedFile = { path: string; patch?: string }

const sideOf = (lines: string[], drop: "+" | "-") =>
  lines.filter((l) => !l.startsWith(drop)).map((l) => l.slice(1)).join("\n")

// Each hunk side is read on its own, so a parser's state never spans a gap.
function packagesOn(path: string, patch: string, drop: "+" | "-"): LockedPackage[] | null {
  const found: LockedPackage[] = []
  for (const hunk of parseHunks(patch)) {
    const parsed = parseLockfileFragment(path, sideOf(hunk.lines, drop))
    if (parsed === null) return null
    found.push(...parsed)
  }
  return found
}

// Packages added or moved to a new version, read from lockfile patches. `unread` is every
// manifest a patch cannot settle: no patch, a format a slice cannot hold, no lockfile beside it.
export function dependenciesFromPatches(manifests: PatchedFile[]): { added: AddedDependency[]; unread: string[] } {
  const added: AddedDependency[] = []
  const unread: string[] = []
  const readDirs = new Set<string>()
  for (const file of manifests.filter((f) => isLockfile(f.path))) {
    const after = file.patch ? packagesOn(file.path, file.patch, "-") : null
    const before = file.patch ? packagesOn(file.path, file.patch, "+") : null
    if (!after || !before) {
      unread.push(file.path)
      continue
    }
    readDirs.add(posix.dirname(file.path))
    const had = new Set(before.map((p) => `${p.name}\0${p.version}`))
    const seen = new Set<string>()
    for (const pkg of after) {
      const key = `${pkg.name}\0${pkg.version}`
      if (had.has(key) || seen.has(key)) continue
      seen.add(key)
      const previous = before.find((p) => p.name === pkg.name)?.version
      added.push({ ...pkg, manifest: file.path, ...(previous ? { previous } : {}) })
    }
  }
  for (const file of manifests) {
    if (!isLockfile(file.path) && !readDirs.has(posix.dirname(file.path))) unread.push(file.path)
  }
  return { added, unread }
}
