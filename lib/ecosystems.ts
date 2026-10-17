// Every package is stored under its OSV ecosystem name, whichever source named
// it: GitHub's dependency graph, GHSA advisories, OSV, or a parsed lockfile.
export const OSV_ECOSYSTEM: Record<string, string> = {
  npm: "npm",
  pip: "PyPI",
  pypi: "PyPI",
  rubygems: "RubyGems",
  go: "Go",
  cargo: "crates.io",
  rust: "crates.io",
  "crates.io": "crates.io",
  maven: "Maven",
  nuget: "NuGet",
  composer: "Packagist",
  packagist: "Packagist",
}

export function osvEcosystem(ecosystem: string): string | null {
  return OSV_ECOSYSTEM[ecosystem.toLowerCase()] ?? null
}

// PyPI names compare case- and separator-insensitively (PEP 503), Packagist by case.
export function packageName(ecosystem: string, name: string): string {
  if (ecosystem === "PyPI") return name.toLowerCase().replace(/[-_.]+/g, "-")
  if (ecosystem === "Packagist") return name.toLowerCase()
  return name
}
