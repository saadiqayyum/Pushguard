// One timestamp format, fixed locale, fixed zone.
const FORMATTER = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
})

export function formatTimestamp(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value
  return `${FORMATTER.format(date)} UTC`
}
