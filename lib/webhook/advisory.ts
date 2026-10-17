import { z } from "zod"
import { CONTRIBUTOR_TITLE_MAX } from "@/lib/contributor/limits"
import { platformModel } from "@/lib/contributor/model"
import { enqueueJob } from "@/lib/db"
import { osvEcosystem } from "@/lib/ecosystems"
import { logger } from "@/lib/logger"
import { MAX_ADVISORY_PACKAGES } from "@/schemas/job"

const MAX_ADVISORY_CWES = 50

const advisoryPayload = z.object({
  action: z.string().max(50),
  security_advisory: z.object({
    ghsa_id: z.string().max(100),
    summary: z.string().max(1024),
    type: z.string().max(50).optional(),
    published_at: z.string().max(40).nullable(),
    withdrawn_at: z.string().max(40).nullable(),
    cwes: z.array(z.object({ cwe_id: z.string().max(20) })).max(MAX_ADVISORY_CWES).default([]),
    vulnerabilities: z
      .array(
        z.object({
          package: z.object({ ecosystem: z.string().max(50), name: z.string().max(214) }),
          vulnerable_version_range: z.string().max(200).nullable(),
        }),
      )
      .max(MAX_ADVISORY_PACKAGES),
  }),
})

type Advisory = z.infer<typeof advisoryPayload>["security_advisory"]

// The webhook payload carries no advisory type, unlike the REST API. GitHub
// files malware under CWE-506 with a "Malicious code in ..." summary.
export function isMalwareAdvisory(advisory: Pick<Advisory, "type" | "cwes" | "summary">): boolean {
  if (advisory.type) return advisory.type === "malware"
  return advisory.cwes.some((cwe) => cwe.cwe_id === "CWE-506") || /^malicious (code|package)/i.test(advisory.summary)
}

// Global advisories reach the App once, not per installation. Only malware is
// queued; vulnerability advisories stay with Dependabot.
export async function handleSecurityAdvisory(raw: string): Promise<number> {
  const { action, security_advisory: advisory } = advisoryPayload.parse(JSON.parse(raw))
  if (!isMalwareAdvisory(advisory)) return 204
  const packages = advisory.vulnerabilities.flatMap((v) => {
    const ecosystem = osvEcosystem(v.package.ecosystem)
    return ecosystem ? [{ ecosystem, name: v.package.name, versionRange: v.vulnerable_version_range, versions: [] }] : []
  })
  if (packages.length === 0) return 204
  await enqueueJob({
    type: "malicious_packages",
    source: "ghsa",
    advisoryId: advisory.ghsa_id,
    summary: advisory.summary,
    publishedAt: advisory.published_at,
    withdrawnAt: action === "withdrawn" ? (advisory.withdrawn_at ?? new Date().toISOString()) : advisory.withdrawn_at,
    packages,
  })
  logger.info("malware_advisory_queued", { advisory: advisory.ghsa_id, action, packages: packages.length })
  if (action === "published" && platformModel()) await queueAdvisoryDraft(advisory, packages)
  return 202
}

// A new malware advisory is a lead for a rule that catches the next one of
// its kind; the AI security expert drafts one for staff review.
async function queueAdvisoryDraft(advisory: Advisory, packages: { ecosystem: string; name: string; versionRange: string | null }[]) {
  const url = `https://github.com/advisories/${encodeURIComponent(advisory.ghsa_id)}`
  await enqueueJob({
    type: "contributor",
    source: "advisory",
    title: `${advisory.ghsa_id}: ${advisory.summary}`.slice(0, CONTRIBUTOR_TITLE_MAX),
    text: [
      advisory.summary,
      ...packages.map((p) => `${p.ecosystem} ${p.name} ${p.versionRange ?? "all versions"}`),
      url,
    ].join("\n"),
    urls: [url],
    requestedBy: "github-advisory",
  })
  logger.info("contributor_advisory_queued", { advisory: advisory.ghsa_id })
}
