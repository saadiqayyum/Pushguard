// Own module so it stays testable: lib/alerts.ts pulls in Octokit, which the
// test runner cannot load.

export type AlertTarget = {
  repo: string
  redactContent: boolean
}

// Where an alert is filed, and whether it may quote what it found.
// Alerts always land in the repository that triggered them, public or private:
export function resolveAlertTarget(sourceRepo: string, sourceIsPrivate: boolean): AlertTarget {
  return { repo: sourceRepo, redactContent: !sourceIsPrivate }
}
