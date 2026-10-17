import { z } from "zod"

export const MAX_SINKS_PER_ORG = 5
export const MAX_SINK_LABEL = 60
export const MAX_SINK_URL = 500

// Only incoming-webhook hosts. An arbitrary URL would make the job runner an
// SSRF proxy into whatever network it runs in.
export const SINK_HOSTS = ["hooks.slack.com", "discord.com", "discordapp.com"] as const

export const sinkUrl = z
  .string()
  .max(MAX_SINK_URL)
  .url()
  .refine((value) => {
    if (!URL.canParse(value)) return false
    const url = new URL(value)
    return (
      url.protocol === "https:" &&
      url.port === "" &&
      url.username === "" &&
      (SINK_HOSTS as readonly string[]).includes(url.hostname)
    )
  }, "Must be a Slack or Discord incoming webhook URL")

export const createSinkBody = z.object({
  label: z.string().trim().min(1).max(MAX_SINK_LABEL),
  url: sinkUrl,
})

export const sinkView = z.object({
  id: z.string(),
  label: z.string(),
  host: z.string(),
  hint: z.string(),
  createdAt: z.string(),
})

export type SinkView = z.infer<typeof sinkView>
