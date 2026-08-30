// Own module so it stays testable: lib/alerts.ts pulls in Octokit, which the
// test runner cannot load.

export type AlertTarget = {
  /** Where the issue is filed. Always the repository that triggered it. */
  repo: string
  /**
   * The issue will be world-readable, so matched content must not be quoted
   * into it.
   */
  redactContent: boolean
}

/**
 * Where an alert is filed, and whether it may quote what it found.
 *
 * Alerts always land in the repository that triggered them, public or private:
 * a public repository is where a malicious push matters *most*, since anyone can
 * clone it, and staying silent there was a hole rather than a safeguard.
 *
 * What does change is the body. An issue quoting the matched lines is fine in a
 * private repository and actively harmful in a public one: it turns an alert
 * about a committed secret into a durable, search-indexed copy of that secret,
 * in a place far easier to find than the commit. That is especially true of
 * force-push findings, where the content was only ever reachable through an
 * orphaned SHA that GitHub was about to collect. So a public target reports the
 * rule, the severity and the files, and sends readers to the dashboard, which is
 * authenticated, for the lines themselves.
 */
export function resolveAlertTarget(sourceRepo: string, sourceIsPrivate: boolean): AlertTarget {
  return { repo: sourceRepo, redactContent: !sourceIsPrivate }
}
