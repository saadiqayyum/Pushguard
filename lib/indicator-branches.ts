import picomatch from "picomatch"

// Line-level checks cost a compare call, so they run on the default branch and
// the org's chosen branches only; file-name indicators need no call and run everywhere.
export function readsDiffFor(branch: string, defaultBranch: string | undefined, extra: string[] | null): boolean {
  if (branch === defaultBranch) return true
  return Boolean(extra?.length) && picomatch(extra!)(branch)
}
