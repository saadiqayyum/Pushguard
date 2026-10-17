import { findChain } from "@/lib/chain"
import { CHAIN_WINDOW_SECONDS } from "@/lib/ci-limits"
import { hit, noteChainEvent, recentChainEvents } from "@/lib/db"
import { metaAlert } from "@/lib/meta-alerts"

const at = (date: Date) => date.toISOString().slice(0, 16).replace("T", " ")

// A tag move closes the chain, so it is the one step that checks for it. One
// meta-alert per member login per window, however many tags move after.
export async function noteTagMoved(org: string, repo: string, detail: string): Promise<void> {
  await noteChainEvent(org, { kind: "tag_moved", repo, login: null, detail })
  const chain = findChain(await recentChainEvents(org))
  if (!chain) return
  if ((await hit(`chain:${org}:${chain.member.login}`, CHAIN_WINDOW_SECONDS)).count !== 1) return
  await metaAlert("tag_repoint_chain", org, [
    `${at(chain.member.at)} @${chain.member.login} was added to ${chain.member.repo ?? org}.`,
    `${at(chain.flash.at)} @${chain.flash.login} pushed and deleted a branch within seconds: ${chain.flash.detail}.`,
    `${at(chain.tag.at)} a tag moved in ${chain.tag.repo}: ${chain.tag.detail}`,
    "This is the tj-actions/changed-files sequence. Remove the member, rotate secrets the flash branch's workflow could read, and restore the tag.",
  ])
}
