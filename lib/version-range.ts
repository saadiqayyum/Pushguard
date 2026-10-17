// ponytail: dotted numeric compare, not each ecosystem's own version grammar.
// Malware ranges are almost always ">= 0" or exact versions, which it gets right.
export function compareVersions(a: string, b: string): number {
  const left = a.replace(/^v/, "").split(/[.+-]/)
  const right = b.replace(/^v/, "").split(/[.+-]/)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = left[i] ?? "0"
    const y = right[i] ?? "0"
    const nx = Number(x)
    const ny = Number(y)
    const diff = Number.isNaN(nx) || Number.isNaN(ny) ? x.localeCompare(y) : nx - ny
    if (diff !== 0) return Math.sign(diff)
  }
  return 0
}

const CHECKS: Record<string, (c: number) => boolean> = {
  "=": (c) => c === 0,
  ">=": (c) => c >= 0,
  "<=": (c) => c <= 0,
  ">": (c) => c > 0,
  "<": (c) => c < 0,
}

// GHSA range syntax, e.g. ">= 1.0.0, < 1.2.3": an AND of comparisons.
export function satisfies(version: string, range: string): boolean {
  return range.split(",").every((part) => {
    const match = /^\s*(>=|<=|=|>|<)?\s*(\S+)\s*$/.exec(part)
    if (!match) return true
    return CHECKS[match[1] ?? "="](compareVersions(version, match[2]))
  })
}

export type AffectedSpec = { versionRange: string | null; versions: string[]; withdrawnAt: Date | null }

// An unknown version (an unpinned requirement) or a spec with neither range nor
// versions counts as affected: a reader cannot tell "not pinned" from "safe".
export function affects(spec: AffectedSpec, version: string): boolean {
  if (spec.withdrawnAt) return false
  if (!version) return true
  if (spec.versions.length > 0) return spec.versions.includes(version)
  return spec.versionRange ? satisfies(version, spec.versionRange) : true
}
