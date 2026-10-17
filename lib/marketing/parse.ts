export type AttackStatus = "confirmed" | "reported" | "possible"

export type AttackDoc = {
  title: string
  type: string
  when: string
  status: AttackStatus
  summary: string
  signal: string | null
}

export type Incident = { date: string; name: string; years: number[] }
export type SurfaceFamily = { title: string; count: number }

const META = /^\*\*Type:\*\*\s*(.+?)\s*·\s*\*\*When:\*\*\s*(.+?)\s*·\s*\*\*Status:\*\*\s*(.+)$/m

// Body of the `## heading` section whose title starts with `prefix`, up to the next `## `.
export function section(markdown: string, prefix: string): string {
  const start = markdown.split("\n").findIndex((line) => line.startsWith(`## ${prefix}`))
  if (start < 0) return ""
  const rest = markdown.split("\n").slice(start + 1)
  const end = rest.findIndex((line) => line.startsWith("## "))
  return (end < 0 ? rest : rest.slice(0, end)).join("\n").trim()
}

export function attackStatus(raw: string): AttackStatus {
  const s = raw.trim().toLowerCase()
  if (s.startsWith("possible")) return "possible"
  if (s.startsWith("reported")) return "reported"
  return "confirmed"
}

export function parseAttackDoc(markdown: string): AttackDoc {
  const title = markdown.match(/^# (.+)$/m)?.[1].trim() ?? "Untitled"
  const meta = markdown.match(META)
  const firstParagraph = section(markdown, "What").split(/\n\s*\n/)[0]?.replace(/\s+/g, " ").trim() ?? ""
  const summary = firstParagraph.match(/^.+?[.!?](?=\s+[A-Z(`]|$)/)?.[0] ?? firstParagraph
  const signal = section(markdown, "Signs to look for").match(/^- In one change:\s*(.+)$/m)?.[1].trim() ?? null
  return {
    title,
    type: meta?.[1] ?? "",
    when: meta?.[2] ?? "",
    status: attackStatus(meta?.[3] ?? ""),
    summary,
    signal,
  }
}

const tableRows = (block: string) =>
  block
    .split("\n")
    .filter((line) => line.startsWith("|") && !/^\|[\s|:-]+\|$/.test(line))
    .slice(1)
    .map((line) => line.slice(1, -1).split(" | ").map((cell) => cell.trim()))

// The first table in the THREAT_CATALOG incident section, one row per incident.
export function parseIncidents(catalog: string): Incident[] {
  const table = section(catalog, "1.").split(/\n\s*\n/).find((block) => block.startsWith("|")) ?? ""
  return tableRows(table).map(([date, name]) => ({
    date,
    name,
    years: (date.match(/\b(?:19|20)\d\d\b/g) ?? []).map(Number),
  }))
}

// Numbered sections of EXECUTION_SURFACES.md; the data-source and cross-cutting tables are not surfaces.
export function parseSurfaces(markdown: string): SurfaceFamily[] {
  return markdown
    .split(/^## /m)
    .filter((chunk) => /^\d+\. /.test(chunk))
    .map((chunk) => ({
      title: chunk.slice(0, chunk.indexOf("\n")).replace(/^\d+\.\s*/, "").trim(),
      count: tableRows(chunk).length,
    }))
}

// A write-up links its siblings as `x.md` or `../category/x.md`; those become library URLs.
export function resolveDocHref(href: string, from: string): string {
  if (!/\.md(#|$)/.test(href)) return href
  const url = new URL(href, `https://docs.invalid/attacks/${from}`)
  const match = url.pathname.match(/^\/attacks\/([a-z0-9-]+)\/([a-z0-9-]+)\.md$/)
  return match ? `/research/${match[1]}/${match[2]}${url.hash}` : href
}
