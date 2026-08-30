/**
 * One timestamp format, fixed locale, fixed zone.
 *
 * `toLocaleString()` with no arguments reads the *runtime's* locale, which is
 * Node's on the server and the browser's on the client. They disagreed, * `30/08/2026, 15:51:57` against `8/30/2026, 3:51:57 PM`, and React responded
 * by discarding the server HTML and re-rendering the whole subtree. The visible
 * symptom was styling that looked stale rather than a date that looked wrong.
 *
 * UTC is also the honest choice here: these are commit and push times, compared
 * against `hour_utc` rules, and read by people in different places.
 */
const FORMATTER = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
})

export function formatTimestamp(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value
  return `${FORMATTER.format(date)} UTC`
}
