import { parse as parseYaml } from "yaml"
import { MAX_MANIFEST_ENTRIES } from "@/lib/db/limits"
import { packageName } from "@/lib/ecosystems"

export type LockedPackage = { ecosystem: string; name: string; version: string }
export type ParsedLockfile = { entries: LockedPackage[]; truncated: boolean }

type Pairs = [name: string, version: string][]

// `fragment` reads a slice of the file (one side of a diff hunk). Absent when
// the format puts the name too far from the version for a hunk to hold both.
type Parser = { ecosystem: string; read: (text: string) => Pairs; fragment?: (text: string) => Pairs }

// Last "@" that is not the scope's leading one: "@scope/a@1.0.0" -> ["@scope/a", "1.0.0"].
function splitAt(spec: string): [string, string] {
  const at = spec.lastIndexOf("@")
  return at > 0 ? [spec.slice(0, at), spec.slice(at + 1)] : [spec, ""]
}

function npmLock(text: string): [string, string][] {
  const lock = JSON.parse(text) as {
    packages?: Record<string, { version?: string; link?: boolean; name?: string }>
    dependencies?: Record<string, NpmV1Dependency>
  }
  if (lock.packages) {
    return Object.entries(lock.packages)
      .filter(([path, meta]) => path.includes("node_modules/") && meta.version && !meta.link)
      .map(([path, meta]) => [meta.name ?? path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length), meta.version!])
  }
  const out: [string, string][] = []
  const walk = (deps: Record<string, NpmV1Dependency> = {}) => {
    for (const [name, meta] of Object.entries(deps)) {
      if (meta.version) out.push([name, meta.version])
      if (out.length < MAX_MANIFEST_ENTRIES) walk(meta.dependencies)
    }
  }
  walk(lock.dependencies)
  return out
}
type NpmV1Dependency = { version?: string; dependencies?: Record<string, NpmV1Dependency> }

// Classic and Berry: an unindented header of specs, then an indented version line.
function yarnLock(text: string): [string, string][] {
  const out: [string, string][] = []
  let name: string | null = null
  for (const line of text.split("\n")) {
    if (line && !line.startsWith(" ") && !line.startsWith("#") && line.endsWith(":")) {
      const spec = line.slice(0, -1).split(",")[0].trim().replace(/^"|"$/g, "")
      name = spec.startsWith("__metadata") || spec.includes("@workspace:") ? null : splitAt(spec)[0]
      continue
    }
    const version = /^\s+version:?\s+"?([^"\s]+)"?/.exec(line)
    if (name && version) {
      out.push([name, version[1]])
      name = null
    }
  }
  return out
}

// Keys by lockfile version: "/a/1.0.0" (v5), "/a@1.0.0" (v6), "a@1.0.0" (v9), each
// optionally followed by a peer suffix "(b@2)" or "_b@2".
function pnpmKey(key: string): [string, string] {
  const bare = key.replace(/^\//, "").replace(/\(.*$/, "")
  const v5 = /^((?:@[^/]+\/)?[^/@]+)\/(\d[^/]*)$/.exec(bare)
  return v5 ? [v5[1], v5[2].replace(/_.*$/, "")] : splitAt(bare)
}

function pnpmLock(text: string): Pairs {
  const lock = parseYaml(text, { maxAliasCount: 100 }) as { packages?: Record<string, unknown> } | null
  return Object.keys(lock?.packages ?? {}).map(pnpmKey)
}

function pnpmFragment(text: string): Pairs {
  return [...text.matchAll(/^ {2}['"]?([^\s'"][^'"]*?)['"]?:\s*$/gm)].map((m) => pnpmKey(m[1])).filter(([, version]) => version)
}

// A name line, then its version line, in a slice of a JSON lockfile.
function keyedFragment(nameLine: RegExp, nameOf: (key: string) => string): (text: string) => Pairs {
  return (text) => {
    const out: Pairs = []
    let name: string | null = null
    for (const line of text.split("\n")) {
      const key = nameLine.exec(line)?.[1]
      if (key) {
        name = nameOf(key)
        continue
      }
      const version = /^\s*"version":\s*"([^"]+)"/.exec(line)?.[1]
      if (name && version) out.push([name, version.replace(/^v/, "")])
      if (version) name = null
    }
    return out
  }
}
const npmFragment = keyedFragment(/^\s*"((?:[^"]*\/)?node_modules\/[^"]+)":\s*\{/, (key) => key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length))
const composerFragment = keyedFragment(/^\s*"name":\s*"([^"]+)"/, (key) => key)

function requirements(text: string): [string, string][] {
  return text
    .split("\n")
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter((line) => line && !line.startsWith("-") && !line.includes("://"))
    .map((line) => {
      const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*(?:===?\s*([^\s;,]+))?/.exec(line)
      return match ? ([match[1], match[2] ?? ""] as [string, string]) : null
    })
    .filter((entry): entry is [string, string] => entry !== null)
}

// poetry.lock and Cargo.lock: [[package]] tables with name and version keys.
function tomlPackages(text: string): [string, string][] {
  return text
    .split(/^\[\[package\]\]\s*$/m)
    .slice(1)
    .map((block) => [/^name\s*=\s*"([^"]+)"/m.exec(block)?.[1], /^version\s*=\s*"([^"]+)"/m.exec(block)?.[1]])
    .filter((pair): pair is [string, string] => Boolean(pair[0] && pair[1]))
}

function goSum(text: string): [string, string][] {
  return text
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length === 3)
    .map(([module, version]) => [module, version.replace(/\/go\.mod$/, "")] as [string, string])
}

// The GEM specs block: four spaces is a gem, six is one of its requirements.
function gemfileLock(text: string): [string, string][] {
  return [...text.matchAll(/^ {4}([A-Za-z0-9_.-]+) \(([^)\s]+)\)$/gm)].map((m) => [m[1], m[2]])
}

function composerLock(text: string): [string, string][] {
  const lock = JSON.parse(text) as Record<string, { name?: string; version?: string }[] | undefined>
  return [...(lock.packages ?? []), ...(lock["packages-dev"] ?? [])]
    .filter((p) => p.name && p.version)
    .map((p) => [p.name!, p.version!.replace(/^v/, "")])
}

function pipfileLock(text: string): [string, string][] {
  const lock = JSON.parse(text) as Record<string, Record<string, { version?: string }> | undefined>
  return [...Object.entries(lock.default ?? {}), ...Object.entries(lock.develop ?? {})].map(([name, meta]) => [
    name,
    (meta.version ?? "").replace(/^==/, ""),
  ])
}

const PARSERS: [RegExp, Parser][] = [
  [/(^|\/)(package-lock|npm-shrinkwrap)\.json$/, { ecosystem: "npm", read: npmLock, fragment: npmFragment }],
  [/(^|\/)yarn\.lock$/, { ecosystem: "npm", read: yarnLock, fragment: yarnLock }],
  [/(^|\/)pnpm-lock\.yaml$/, { ecosystem: "npm", read: pnpmLock, fragment: pnpmFragment }],
  [/(^|\/)requirements[^/]*\.txt$/, { ecosystem: "PyPI", read: requirements, fragment: requirements }],
  [/(^|\/)poetry\.lock$/, { ecosystem: "PyPI", read: tomlPackages, fragment: tomlPackages }],
  [/(^|\/)Pipfile\.lock$/, { ecosystem: "PyPI", read: pipfileLock }],
  [/(^|\/)go\.sum$/, { ecosystem: "Go", read: goSum, fragment: goSum }],
  [/(^|\/)Cargo\.lock$/, { ecosystem: "crates.io", read: tomlPackages, fragment: tomlPackages }],
  [/(^|\/)Gemfile\.lock$/, { ecosystem: "RubyGems", read: gemfileLock, fragment: gemfileLock }],
  [/(^|\/)composer\.lock$/, { ecosystem: "Packagist", read: composerLock, fragment: composerFragment }],
]

export function isLockfile(path: string): boolean {
  return PARSERS.some(([pattern]) => pattern.test(path))
}

// Deduplicated and capped. A lockfile that does not parse throws, so the
// caller can log it as not inventoried instead of recording it as empty.
export function parseLockfile(path: string, text: string): ParsedLockfile {
  const parser = PARSERS.find(([pattern]) => pattern.test(path))?.[1]
  if (!parser) return { entries: [], truncated: false }
  const seen = new Map<string, LockedPackage>()
  for (const [rawName, version] of parser.read(text)) {
    const name = packageName(parser.ecosystem, rawName)
    seen.set(`${name}\0${version}`, { ecosystem: parser.ecosystem, name, version })
  }
  const entries = [...seen.values()]
  return { entries: entries.slice(0, MAX_MANIFEST_ENTRIES), truncated: entries.length > MAX_MANIFEST_ENTRIES }
}

// Packages named in a slice of a lockfile, or null when its format cannot be
// read from a slice and the caller must ask GitHub's dependency graph instead.
export function parseLockfileFragment(path: string, text: string): LockedPackage[] | null {
  const parser = PARSERS.find(([pattern]) => pattern.test(path))?.[1]
  if (!parser?.fragment) return null
  return parser.fragment(text).map(([rawName, version]) => ({ ecosystem: parser.ecosystem, name: packageName(parser.ecosystem, rawName), version }))
}
