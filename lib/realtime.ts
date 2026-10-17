import { createHmac } from "node:crypto"
import { broadcast } from "@/lib/db"
import { env } from "@/lib/env"
import { logger } from "@/lib/logger"

export const LIVE_EVENTS = ["sync", "alert", "scan", "installation"] as const
export type LiveEvent = (typeof LIVE_EVENTS)[number]

// Broadcast channels are public, so the topic is the secret: an HMAC only the
// server can derive, handed to users who can already see the org. Messages
// carry an event name and nothing else; the page re-reads through the API.
export function topicFor(org: string): string {
  return `pg-${createHmac("sha256", env().AUTH_SECRET).update(`live:${org.toLowerCase()}`).digest("hex").slice(0, 32)}`
}

export function liveTopics(orgs: string[]): string[] {
  return [...new Set(orgs.map(topicFor))]
}

// Never throws: a missed nudge only means the page updates on its next load.
export async function announce(org: string, event: LiveEvent): Promise<void> {
  await broadcast(topicFor(org), event).catch((error: unknown) => logger.warn("live_announce_failed", { org, event, error: String(error) }))
}
