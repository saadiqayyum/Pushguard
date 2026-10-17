const DAY_MS = 86_400_000

// One entry per UTC day, oldest first, ending today; days with no rows count zero.
export function fillDays(rows: { day: string; n: number }[], days: number, now = new Date()): { day: string; n: number }[] {
  const counts = new Map(rows.map((row) => [row.day, row.n]))
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(now.getTime() - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10)
    return { day, n: counts.get(day) ?? 0 }
  })
}
