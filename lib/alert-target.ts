// Own module so it stays testable: lib/alerts.ts pulls in Octokit, which the
// test runner cannot load.

// Where an alert gets filed: the repo that triggered it. No configuration, and
// the finding stays with the code. Null means "do not file": the issue body
// quotes the offending lines, so a public repo never gets one.
export function resolveAlertTarget(
  sourceRepo: string,
  sourceIsPrivate: boolean,
): string | null {
  return sourceIsPrivate ? sourceRepo : null
}
