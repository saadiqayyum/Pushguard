import type { ThreatIndicator } from "@/lib/db/threat-indicators"

export type Indicator = Pick<ThreatIndicator, "kind" | "value" | "campaign" | "actorName" | "references">

export type IndicatorMatcher = {
  tokens: Map<string, Indicator[]>
  substrings: { needle: string; indicator: Indicator }[]
  fileNames: Map<string, Indicator[]>
}

const TOKEN_KINDS = new Set(["domain", "ip", "wallet"])

const add = (map: Map<string, Indicator[]>, key: string, indicator: Indicator) =>
  map.set(key, [...(map.get(key) ?? []), indicator])

// Domains, IPs and wallets are Set lookups on the tokens of a line; only URLs
// and free strings are substring scans, and those lists are short.
export function buildMatcher(indicators: Indicator[]): IndicatorMatcher {
  const matcher: IndicatorMatcher = { tokens: new Map(), substrings: [], fileNames: new Map() }
  for (const indicator of indicators) {
    const value = indicator.value.toLowerCase()
    if (TOKEN_KINDS.has(indicator.kind)) add(matcher.tokens, value, indicator)
    else if (indicator.kind === "file_name") add(matcher.fileNames, value, indicator)
    else if (indicator.kind === "url" || indicator.kind === "string") matcher.substrings.push({ needle: value, indicator })
  }
  return matcher
}

// A subdomain of a listed domain is a hit: "x.evil.example" matches "evil.example".
function tokenHits(matcher: IndicatorMatcher, line: string): Indicator[] {
  const hits: Indicator[] = []
  for (const raw of line.toLowerCase().split(/[^a-z0-9._-]+/)) {
    const token = raw.replace(/^\.+|\.+$/g, "")
    if (!token) continue
    const labels = token.split(".")
    for (let i = 0; i < labels.length - 1 || i === 0; i++) hits.push(...(matcher.tokens.get(labels.slice(i).join(".")) ?? []))
  }
  return hits
}

export function matchIndicators(matcher: IndicatorMatcher, addedLines: string[], paths: string[]): Indicator[] {
  const hits = new Set<Indicator>()
  for (const line of addedLines) {
    for (const hit of tokenHits(matcher, line)) hits.add(hit)
    if (matcher.substrings.length === 0) continue
    const lower = line.toLowerCase()
    for (const { needle, indicator } of matcher.substrings) if (lower.includes(needle)) hits.add(indicator)
  }
  for (const path of paths) {
    const lower = path.toLowerCase()
    for (const hit of matcher.fileNames.get(lower.slice(lower.lastIndexOf("/") + 1)) ?? []) hits.add(hit)
    for (const hit of matcher.fileNames.get(lower) ?? []) hits.add(hit)
  }
  return [...hits]
}
