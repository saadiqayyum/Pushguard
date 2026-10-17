import type { AttackStatus } from "./parse"

export type StatusCounts = Record<AttackStatus, number>

// The one count of write-ups per status: the library's summary line and its filter chips both read it.
export function statusCounts(attacks: { status: AttackStatus }[]): StatusCounts {
  const counts: StatusCounts = { confirmed: 0, reported: 0, possible: 0 }
  for (const attack of attacks) counts[attack.status]++
  return counts
}
