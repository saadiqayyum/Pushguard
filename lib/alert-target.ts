// Own module so it stays testable: lib/alerts.ts pulls in Octokit, which the
// test runner cannot load.

// Where an alert gets filed. Default is the repo that triggered it — no
// configuration, and the finding stays with the code. A configured alertsRepo
// overrides that for orgs wanting central triage. Null means "do not file":
// the issue body quotes the offending lines, so a public repo is only ever a
// target when someone picked it deliberately.
export function resolveAlertTarget(
  alertsRepo: string | null,
  sourceRepo: string,
  sourceIsPrivate: boolean,
): string | null {
  if (alertsRepo) return alertsRepo
  return sourceIsPrivate ? sourceRepo : null
}
