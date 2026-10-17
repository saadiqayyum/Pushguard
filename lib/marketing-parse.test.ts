import assert from "node:assert/strict"
import { test } from "node:test"
import { attackStatus, parseAttackDoc, parseIncidents, parseSurfaces, resolveDocHref } from "@/lib/marketing/parse"

const DOC = `# Tag repointing

**Type:** CI/CD · **When:** Nov 2024 – Mar 2025 · **Status:** confirmed (CVE)

## What happened

An attacker moved the tags. Every workflow then ran it.

## Signs to look for

- In one change: a push on \`refs/tags/*\` with \`forced: true\`.
- Across changes over time: a member added.

## How Pushguard catches it

- \`tag-moved\` and \`ci-action-unpinned\`; \`tag-moved\` again, \`author_mismatch\`.

## References
`

test("attack doc: title, meta, first sentence, single-change signal", () => {
  const doc = parseAttackDoc(DOC)
  assert.equal(doc.title, "Tag repointing")
  assert.equal(doc.when, "Nov 2024 – Mar 2025")
  assert.equal(doc.status, "confirmed")
  assert.equal(doc.summary, "An attacker moved the tags.")
  assert.equal(doc.signal, "a push on `refs/tags/*` with `forced: true`.")
})

test("status words map to the three filters", () => {
  assert.equal(attackStatus("possible future"), "possible")
  assert.equal(attackStatus("reported "), "reported")
  assert.equal(attackStatus("confirmed (CVE); possible (pattern)"), "confirmed")
})

test("incident table rows and years; separator and header skipped", () => {
  const md = "## 1. Incidents\n\nIntro.\n\n| Date | Incident | How |\n|---|---|---|\n| Jul 2018 | eslint-scope | x |\n| 2008 build, disclosed Dec 2015 | Juniper | y |\n\nAfter.\n\n## 2. Next\n| a | b |"
  const rows = parseIncidents(md)
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[1].years, [2008, 2015])
})

test("surfaces come from numbered sections only", () => {
  const md = "## 1. Clone\n\n| Surface | Status |\n|---|---|\n| `.gitmodules` | rule |\n| hooks | gap |\n\n## Data sources\n\n| Source | Status |\n|---|---|\n| osv | rule |"
  assert.deepEqual(parseSurfaces(md), [{ title: "Clone", count: 2 }])
})

test("write-up links resolve to library URLs; other hrefs pass through", () => {
  assert.equal(resolveDocHref("teampcp-trivy.md", "ci-cd/tag.md"), "/research/ci-cd/teampcp-trivy")
  assert.equal(resolveDocHref("../packages/axios-2026.md#signs", "ci-cd/tag.md"), "/research/packages/axios-2026#signs")
  assert.equal(resolveDocHref("#references", "ci-cd/tag.md"), "#references")
})

test("library summary line and status chips read the same counts", async () => {
  const { marketingStats } = await import("@/lib/marketing/stats")
  const { statusCounts } = await import("@/lib/marketing/counts")
  const stats = marketingStats()
  assert.deepEqual(stats.byStatus, statusCounts(stats.attacks))
  assert.equal(stats.byStatus.confirmed + stats.byStatus.reported + stats.byStatus.possible, stats.attacks.length)
  assert.equal(stats.byCategory.reduce((n, c) => n + c.count, 0), stats.attacks.length)
})

test("public render drops the detection section and the catalogue's internal parts", async () => {
  const { remark } = await import("remark")
  const { default: remarkGfm } = await import("remark-gfm")
  const { remarkStripInternal } = await import("@/lib/marketing/remark-strip-internal")
  const render = (value: string, path: string) =>
    String(remark().use(remarkGfm).use(remarkStripInternal).processSync({ value, path }))

  const article = render(DOC, "/x/docs/attacks/ci-cd/tag.md")
  assert.match(article, /Signs to look for/)
  assert.doesNotMatch(article, /How Pushguard|tag-moved/)

  const catalog = render(
    "Bottom line, Pushguard is blind here.\n\n## How to read\n\nL1 is the engine.\n\n## 1. Incidents\n\nThe attack spread. Pushguard is built to close that gap.\n\n## 2. Classes and the layer that catches each\n\n| Field | Content |\n|---|---|\n| Entry | Stolen token |\n| Best layer | L1 `x-y` |\n| Gap | none |\n\n## 5. Coverage matrix\n\nGAP-1",
    "/x/docs/THREAT_CATALOG.md",
  )
  assert.match(catalog, /The attack spread\./)
  assert.match(catalog, /## 2\. Classes\n/)
  assert.match(catalog, /Stolen token/)
  assert.doesNotMatch(catalog, /Pushguard|L1|Best layer|Gap|GAP-|Coverage/)
})
