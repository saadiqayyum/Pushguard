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

const COMPACT = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })
const WHOLE = new Intl.NumberFormat("en")

export const formatCompact = (n: number) => COMPACT.format(n)
export const formatNumber = (n: number) => WHOLE.format(n)
