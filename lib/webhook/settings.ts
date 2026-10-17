import { z } from "zod"
import { activeInstallation, enqueueJob } from "@/lib/db"
import { logger } from "@/lib/logger"
import { metaAlert } from "@/lib/meta-alerts"

const MAX_NAME = 200

const settingsPayload = z.object({
  action: z.string().max(50),
  repository: z.object({ full_name: z.string().max(200) }).optional(),
  organization: z.object({ login: z.string().max(100) }).optional(),
  sender: z.object({ login: z.string().max(100) }),
  key: z.object({ title: z.string().max(MAX_NAME).nullish(), read_only: z.boolean().optional() }).optional(),
  rule: z.object({ name: z.string().max(MAX_NAME).nullish() }).optional(),
  repository_ruleset: z.object({ name: z.string().max(MAX_NAME).nullish() }).optional(),
})

export type SettingsEvent = "deploy_key" | "branch_protection_rule" | "repository_ruleset"

type Classified = { ruleId: "deploy-key-added" | "protection-weakened" | "protection-deleted"; severity: "high" | "critical"; line: string }

// Deploy keys and protection changes are how access survives a credential
// rotation, and none of them shows up in a push.
export function classifySettings(event: SettingsEvent, payload: z.infer<typeof settingsPayload>): Classified | null {
  const by = `@${payload.sender.login}`
  if (event === "deploy_key") {
    if (payload.action !== "created") return null
    const writable = payload.key?.read_only === false
    return {
      ruleId: "deploy-key-added",
      severity: writable ? "critical" : "high",
      line: `${writable ? "Write" : "Read-only"} deploy key "${payload.key?.title ?? "untitled"}" added by ${by}.`,
    }
  }
  const name = event === "branch_protection_rule" ? payload.rule?.name : payload.repository_ruleset?.name
  const what = event === "branch_protection_rule" ? "Branch protection rule" : "Ruleset"
  if (payload.action === "deleted") {
    return { ruleId: "protection-deleted", severity: "critical", line: `${what} "${name ?? "unnamed"}" deleted by ${by}.` }
  }
  if (payload.action === "edited") {
    return { ruleId: "protection-weakened", severity: "high", line: `${what} "${name ?? "unnamed"}" edited by ${by}.` }
  }
  return null
}

export async function handleSettingsEvent(raw: string, event: SettingsEvent): Promise<number> {
  const payload = settingsPayload.parse(JSON.parse(raw))
  const repo = payload.repository?.full_name
  const org = repo?.split("/")[0] ?? payload.organization?.login
  if (!org || !(await activeInstallation(org))) return 204
  if (event === "repository_ruleset" && repo) await enqueueJob({ type: "tag_posture", repo })

  const classified = classifySettings(event, payload)
  if (!classified) return 204

  if (repo) {
    await enqueueJob({ type: "settings_alert", repo, ...classified })
  } else {
    await metaAlert("org_ruleset_changed", org, [classified.line])
  }
  logger.info("settings_event", { event, action: payload.action, org, repo: repo ?? null, rule: classified.ruleId })
  return 204
}
