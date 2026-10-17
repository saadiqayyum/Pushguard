import { CHAIN_WINDOW_SECONDS } from "@/lib/ci-limits"

export type ChainKind = "member_added" | "branch_created" | "branch_flash" | "tag_moved"
export type ChainEvent = { kind: ChainKind; repo: string | null; login: string | null; detail: string; at: Date }
export type Chain = { member: ChainEvent; flash: ChainEvent; tag: ChainEvent }

// Member added, then a flash branch by that login, then a tag moved, all in
// order inside one window. The tag move has no actor: the snapshot cannot see who.
export function findChain(events: ChainEvent[]): Chain | null {
  const window = CHAIN_WINDOW_SECONDS * 1000
  const tags = events.filter((e) => e.kind === "tag_moved").sort((a, b) => b.at.getTime() - a.at.getTime())
  for (const tag of tags) {
    for (const member of events.filter((e) => e.kind === "member_added" && e.login)) {
      if (member.at > tag.at || tag.at.getTime() - member.at.getTime() > window) continue
      const flash = events.find(
        (e) => e.kind === "branch_flash" && e.login?.toLowerCase() === member.login!.toLowerCase() && e.at >= member.at && e.at <= tag.at,
      )
      if (flash) return { member, flash, tag }
    }
  }
  return null
}
