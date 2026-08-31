
// The stored title is the GitHub issue title, `[critical] acme/api: rule-a, rule-b`.
export function alertHeadline(title: string, repo: string): string {
  return title
    .replace(/^\[(low|medium|high|critical)\]\s*/i, "")
    .replace(new RegExp(`^${repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*`), "")
    .trim()
}

// Identical added lines are one fact repeated, not five findings.
export function collapseLines(lines: string[]): { line: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1)
  return [...counts.entries()].map(([line, count]) => ({ line, count }))
}
