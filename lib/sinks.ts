import { sealedSinks } from "@/lib/db/alert-sinks"
import { logger } from "@/lib/logger"
import { open } from "@/lib/secret-box"
import { sinkUrl } from "@/schemas/alert-sink"
import type { Severity } from "@/schemas/rule"

export const SINK_TIMEOUT_MS = 5_000
export const MAX_SINK_LINES = 10
export const MAX_SINK_LINE_CHARS = 300

export type SinkMessage = {
  severity: Severity
  title: string
  url?: string
  lines: string[]
}

// Slack's incoming-webhook body. Discord accepts it on the same URL plus /slack.
// Mentions are broken with a zero-width space: the text comes from pushes.
export function slackBody(message: SinkMessage): { text: string } {
  const clean = (value: string) =>
    value.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!).replace(/@/g, "@​")
  const lines = message.lines
    .slice(0, MAX_SINK_LINES)
    .map((line) => clean(line.slice(0, MAX_SINK_LINE_CHARS)))
  const title = `[${message.severity}] ${clean(message.title)}`
  return {
    text: [message.url ? `<${message.url}|${title}>` : title, ...lines].join("\n"),
  }
}

export function deliveryUrl(raw: string): string | null {
  const parsed = sinkUrl.safeParse(raw)
  if (!parsed.success) return null
  const url = new URL(parsed.data)
  const discord = url.hostname === "discord.com" || url.hostname === "discordapp.com"
  return discord && !url.pathname.endsWith("/slack") ? `${parsed.data.replace(/\/$/, "")}/slack` : parsed.data
}

// Sends to every sink of the org. Returns how many accepted it; a failed sink
// is logged, never thrown, so one dead webhook cannot block an alert.
export async function notifySinks(org: string, message: SinkMessage): Promise<number> {
  const sinks = await sealedSinks(org)
  const body = JSON.stringify(slackBody(message))
  const results = await Promise.all(
    sinks.map(async (sink) => {
      const url = deliveryUrl(open(sink) ?? "")
      if (!url) {
        logger.error("sink_unusable", { org, sink: sink.id })
        return false
      }
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          redirect: "error",
          signal: AbortSignal.timeout(SINK_TIMEOUT_MS),
        })
        if (!response.ok) logger.warn("sink_rejected", { org, sink: sink.id, status: response.status })
        return response.ok
      } catch (error) {
        logger.warn("sink_failed", { org, sink: sink.id, error: error instanceof Error ? error.name : "unknown" })
        return false
      }
    }),
  )
  return results.filter(Boolean).length
}
