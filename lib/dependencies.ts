import { enqueueJobs, maliciousEntriesFor, MALICIOUS_CACHE_TTL_HOURS, type MaliciousPackage } from "@/lib/db"
import { osvEcosystem, packageName } from "@/lib/ecosystems"
import { logger } from "@/lib/logger"
import { affects } from "@/lib/version-range"
import type { Severity } from "@/schemas/rule"

export const MAX_CHECKED_DEPENDENCIES = 50
export const DEPENDENCY_FETCH_TIMEOUT_MS = 5_000
export const FRESH_VERSION_HOURS = 72
export const MAX_PACKUMENT_BYTES = 5_000_000

const OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch"
const NPM_REGISTRY = "https://registry.npmjs.org"
const INSTALL_SCRIPTS = ["preinstall", "install", "postinstall", "prepare"] as const

export type AddedDependency = { name: string; version: string; ecosystem: string; manifest: string; previous?: string }

export type DependencySignal = {
  id:
    | "dependency-known-malicious"
    | "dependency-install-script"
    | "dependency-just-published"
    | "dependency-maintainer-changed"
    | "dependency-not-checked"
  severity: Severity
  dependency: AddedDependency
  detail: string
}

type NpmVersion = { scripts?: Record<string, string>; _npmUser?: { name?: string } }
type Packument = { time?: Record<string, string>; versions?: Record<string, NpmVersion> }

export function npmSignals(dep: AddedDependency, packument: Packument, now: Date): DependencySignal[] {
  const signals: DependencySignal[] = []
  const meta = packument.versions?.[dep.version]
  if (!meta) return signals

  const scripts = INSTALL_SCRIPTS.filter((name) => meta.scripts?.[name])
  if (scripts.length > 0) {
    signals.push({ id: "dependency-install-script", severity: "high", dependency: dep, detail: `runs ${scripts.join(", ")} on install` })
  }

  const published = packument.time?.[dep.version]
  if (published && now.getTime() - Date.parse(published) < FRESH_VERSION_HOURS * 3_600_000) {
    signals.push({ id: "dependency-just-published", severity: "medium", dependency: dep, detail: `published ${published}` })
  }

  const ordered = Object.entries(packument.time ?? {})
    .filter(([version]) => packument.versions?.[version])
    .sort(([, a], [, b]) => Date.parse(a) - Date.parse(b))
    .map(([version]) => version)
  const previous = ordered[ordered.indexOf(dep.version) - 1]
  const before = previous ? packument.versions?.[previous]?._npmUser?.name : undefined
  const publisher = meta._npmUser?.name
  if (before && publisher && before !== publisher) {
    signals.push({
      id: "dependency-maintainer-changed",
      severity: "high",
      dependency: dep,
      detail: `${previous} published by ${before}, ${dep.version} by ${publisher}`,
    })
  }
  return signals
}

export function osvSignals(deps: AddedDependency[], results: { vulns?: { id: string }[] }[]): DependencySignal[] {
  return deps.flatMap((dep, i) =>
    (results[i]?.vulns ?? [])
      .filter((vuln) => vuln.id.startsWith("MAL-"))
      .map((vuln) => ({
        id: "dependency-known-malicious" as const,
        severity: "critical" as const,
        dependency: dep,
        detail: `listed as malicious (${vuln.id})`,
      })),
  )
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(DEPENDENCY_FETCH_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  if (Number(response.headers.get("content-length") ?? 0) > MAX_PACKUMENT_BYTES) throw new Error("response too large")
  return (await response.json()) as T
}

type Keyed = { dep: AddedDependency; ecosystem: string; name: string }

// Stored entries that already settle a dependency. An OSV-sourced entry past
// its TTL does not, so a withdrawn OSV record stops flagging after a day.
export function cachedMaliciousHits(keyed: Keyed, entries: MaliciousPackage[], now: Date): MaliciousPackage[] {
  const oldest = now.getTime() - MALICIOUS_CACHE_TTL_HOURS * 3_600_000
  return entries.filter(
    (entry) =>
      entry.ecosystem === keyed.ecosystem &&
      entry.name === keyed.name &&
      (entry.source !== "osv" || entry.fetchedAt.getTime() >= oldest) &&
      affects(entry, keyed.dep.version),
  )
}

async function queryOsv(keyed: Keyed[]): Promise<DependencySignal[]> {
  if (keyed.length === 0) return []
  try {
    const body = { queries: keyed.map((k) => ({ package: { name: k.dep.name, ecosystem: k.ecosystem }, version: k.dep.version })) }
    const data = await fetchJson<{ results: { vulns?: { id: string }[] }[] }>(OSV_BATCH_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    const signals = osvSignals(keyed.map((k) => k.dep), data.results)
    await recordOsvHits(keyed, data.results)
    return signals
  } catch (error) {
    logger.warn("osv_lookup_failed", { error: error instanceof Error ? error.message : String(error) })
    return keyed.map(({ dep }) => ({ id: "dependency-not-checked" as const, severity: "low" as const, dependency: dep, detail: "malicious-package lookup failed" }))
  }
}

// Each MAL id becomes an ingest job, so the hit is cached and every other
// repository already depending on that version is alerted too.
async function recordOsvHits(keyed: Keyed[], results: { vulns?: { id: string }[] }[]): Promise<void> {
  const byVuln = new Map<string, Keyed[]>()
  keyed.forEach((k, i) =>
    (results[i]?.vulns ?? []).filter((v) => v.id.startsWith("MAL-")).forEach((v) => byVuln.set(v.id, [...(byVuln.get(v.id) ?? []), k])),
  )
  await enqueueJobs(
    [...byVuln].map(([id, hits]) => ({
      type: "malicious_packages" as const,
      source: "osv" as const,
      advisoryId: id,
      summary: "",
      publishedAt: null,
      withdrawnAt: null,
      packages: hits.map((k) => ({ ecosystem: k.ecosystem, name: k.name, versionRange: null, versions: [k.dep.version] })),
    })),
  )
}

// Checks added dependencies. A lookup that fails is reported as a signal, not
// dropped: an unchecked dependency is not a clean one.
export async function checkDependencies(added: AddedDependency[], now = new Date()): Promise<DependencySignal[]> {
  const deps = added.slice(0, MAX_CHECKED_DEPENDENCIES)
  const signals: DependencySignal[] = added.slice(MAX_CHECKED_DEPENDENCIES).map((dependency) => ({
    id: "dependency-not-checked",
    severity: "low",
    dependency,
    detail: `over the ${MAX_CHECKED_DEPENDENCIES}-dependency check budget`,
  }))

  const keyed = deps.flatMap((dep) => {
    const ecosystem = osvEcosystem(dep.ecosystem)
    return ecosystem ? [{ dep, ecosystem, name: packageName(ecosystem, dep.name) }] : []
  })
  const cached = await maliciousEntriesFor(keyed)
  const unresolved: Keyed[] = []
  for (const k of keyed) {
    const hits = cachedMaliciousHits(k, cached, now)
    if (hits.length === 0) unresolved.push(k)
    signals.push(
      ...hits.map((entry) => ({
        id: "dependency-known-malicious" as const,
        severity: "critical" as const,
        dependency: k.dep,
        detail: `listed as malicious (${entry.advisoryId})`,
      })),
    )
  }
  signals.push(...(await queryOsv(unresolved)))

  await Promise.all(
    deps
      .filter((dep) => dep.ecosystem.toLowerCase() === "npm")
      .map(async (dep) => {
        try {
          const packument = await fetchJson<Packument>(`${NPM_REGISTRY}/${dep.name.replace("/", "%2F")}`)
          signals.push(...npmSignals(dep, packument, now))
        } catch (error) {
          logger.warn("npm_lookup_failed", { name: dep.name, error: error instanceof Error ? error.message : String(error) })
          signals.push({ id: "dependency-not-checked", severity: "low", dependency: dep, detail: "registry lookup failed" })
        }
      }),
  )
  return signals
}
