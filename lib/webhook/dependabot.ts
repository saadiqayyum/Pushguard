import { z } from "zod"
import { activeInstallation, enqueueJob } from "@/lib/db"
import { ownerOf } from "@/lib/finding"
import { logger } from "@/lib/logger"
import { isMalwareAdvisory } from "@/lib/webhook/advisory"

const OPENED = new Set(["created", "reopened", "auto_reopened", "reintroduced"])

const dependabotPayload = z.object({
  action: z.string().max(50),
  repository: z.object({ full_name: z.string().max(200) }),
  alert: z.object({
    number: z.number().int(),
    html_url: z.string().url().max(500),
    dependency: z.object({
      package: z.object({ ecosystem: z.string().max(50), name: z.string().max(214) }),
      manifest_path: z.string().max(1024),
    }),
    security_advisory: z.object({
      ghsa_id: z.string().max(100),
      summary: z.string().max(1024),
      severity: z.string().max(20),
      type: z.string().max(50).optional(),
      cwes: z.array(z.object({ cwe_id: z.string().max(20) })).max(50).default([]),
    }),
    security_vulnerability: z.object({ vulnerable_version_range: z.string().max(200).nullable() }).optional(),
  }),
})

// GitHub matches its advisories, malware included, against each repository's
// dependency graph and tells us here: the retro-alert costs no lookup of our own.
// Plain vulnerabilities stay with Dependabot; only malware becomes a Pushguard alert.
export async function handleDependabotAlert(raw: string): Promise<number> {
  const payload = dependabotPayload.parse(JSON.parse(raw))
  const { alert, repository } = payload
  if (!OPENED.has(payload.action) || !isMalwareAdvisory(alert.security_advisory)) return 204
  if (!(await activeInstallation(ownerOf(repository.full_name)))) return 204

  await enqueueJob({
    type: "dependabot_malware",
    repo: repository.full_name,
    ecosystem: alert.dependency.package.ecosystem,
    name: alert.dependency.package.name,
    manifest: alert.dependency.manifest_path,
    advisory: alert.security_advisory.ghsa_id,
    summary: alert.security_advisory.summary.slice(0, 300),
    range: alert.security_vulnerability?.vulnerable_version_range ?? null,
    url: alert.html_url,
  })
  logger.warn("dependabot_malware_alert", { repo: repository.full_name, advisory: alert.security_advisory.ghsa_id })
  return 204
}
