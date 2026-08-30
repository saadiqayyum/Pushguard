// Own module so it stays testable: everything else on the deep-link path pulls
// in Octokit or next/headers, which the test runner cannot load.

export const INTENT_COOKIE = "pushguard_scan_intent"

export type ScanIntent = { account: string; repo: string | null; path: string }

// Dots are legal in GitHub names, so the character class has to allow them, // which lets `.` and `..` through, and those become traversal once this lands in
// a redirect path. Require at least one character that is not a dot.
const SEGMENT = /^[A-Za-z0-9_.-]+$/
const ALL_DOTS = /^\.+$/
const MAX_SEGMENT = 100

/**
 * Read a `/scan/owner` or `/scan/owner/repo` deep link.
 *
 * This is not the free-text box that came out: a URL states what someone *wants*
 * to scan, and wanting is not being allowed. The result is still checked against
 * `listUserInstallationRepos` before anything is read. What this function is for
 * is making sure the value can never be anything but two path segments. It is
 * echoed into a redirect after sign-in, so a `//evil.com` here would be an open
 * redirect.
 */
export function parseScanIntent(segments: string[] | undefined): ScanIntent | null {
  const parts = (segments ?? []).slice(0, 2)
  if (parts.length === 0) return null
  if (parts.some((part) => !SEGMENT.test(part) || ALL_DOTS.test(part) || part.length > MAX_SEGMENT)) {
    return null
  }

  const [account, repo] = parts
  return {
    account,
    repo: repo ? `${account}/${repo}` : null,
    path: `/scan/${parts.join("/")}`,
  }
}

/** The same validation, for a target arriving as one `owner/repo` string. */
export function parseIntentParam(value: string | null): ScanIntent | null {
  return value ? parseScanIntent(value.split("/")) : null
}
