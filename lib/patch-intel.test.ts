import assert from "node:assert/strict"
import { test } from "node:test"
import { structuredPatch } from "diff"
import { extractFacts, pathReferences } from "@/lib/code-intel/facts"
import { patchFileState, type FileState } from "@/lib/code-intel/incremental"
import { hunkWindows, shiftLine } from "@/lib/code-intel/line-map"
import { intelSources } from "@/lib/code-intel/sources"
import { enclosingSymbol, extractSymbols } from "@/lib/code-intel/symbols"
import { parseHunks } from "@/lib/diff-lines"

async function fullState(path: string, text: string): Promise<FileState> {
  const parsed = await extractSymbols(path, text)
  return {
    symbols: [...(parsed ?? []), ...pathReferences(path, text.split("\n"))],
    facts: await extractFacts({ path, source: text }, parsed),
  }
}

// GitHub's patch format: hunks only, three lines of context.
const unifiedPatch = (a: string, b: string) =>
  structuredPatch("a", "b", a, b, "", "", { context: 3 })
    .hunks.map((h) => [`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`, ...h.lines].join("\n"))
    .join("\n")

const symbolKey = (s: FileState["symbols"][number]) => `${s.role}:${s.name}@${s.line}-${s.endLine}`
const factKey = (f: FileState["facts"][number]) => `${f.kind}:${f.detail}@${f.line}:${f.symbol}`

// x-ray needs a whole program, which a hunk is not: its facts on edited lines
// are the known gap until the index job re-reads the file.
async function assertPatchMatchesReparse(path: string, before: string, after: string) {
  const stored = await fullState(path, before)
  const patch = unifiedPatch(before, after)
  const patched = await patchFileState(path, stored, patch)
  const exact = await fullState(path, after)
  assert.deepEqual(patched.symbols.map(symbolKey).sort(), exact.symbols.map(symbolKey).sort())
  const lineFacts = (facts: FileState["facts"]) => facts.filter((f) => !f.detail.startsWith("xray-")).map(factKey).sort()
  assert.deepEqual(lineFacts(patched.facts), lineFacts(exact.facts))
}

const BASE = [
  'import { run } from "./runner"',
  "",
  "export function alpha(a) {",
  "  const total = a + 1",
  "  return total",
  "}",
  "",
  "function beta(b) {",
  "  return run(b)",
  "}",
  "",
  "class Gamma {",
  "  delta() {",
  "    return beta(2)",
  "  }",
  "}",
]

test("shiftLine maps old lines across insertions and removals", () => {
  const hunks = parseHunks("@@ -2,3 +2,4 @@\n a\n-b\n+B\n+C\n c\n@@ -10,0 +12,2 @@\n+x\n+y")
  assert.equal(shiftLine(hunks, 1), 1)
  assert.equal(shiftLine(hunks, 2), 2)
  assert.equal(shiftLine(hunks, 3), null)
  assert.equal(shiftLine(hunks, 3, "before"), 2)
  assert.equal(shiftLine(hunks, 4), 5)
  assert.equal(shiftLine(hunks, 9), 10)
  assert.equal(shiftLine(hunks, 10), 11)
  assert.equal(shiftLine(hunks, 11), 14)
})

test("parseHunks reads a header with omitted counts", () => {
  assert.deepEqual(parseHunks("@@ -1 +1 @@\n-a\n+b").map((h) => [h.oldStart, h.oldLines, h.newStart, h.newLines]), [[1, 1, 1, 1]])
})

test("hunkWindows numbers the added lines on the new side", () => {
  const [w] = hunkWindows(parseHunks("@@ -2,3 +2,4 @@\n a\n-b\n+B\n+C\n c"))
  assert.deepEqual([w.start, w.end, [...w.added]], [2, 5, [3, 4]])
  assert.equal(w.text, "a\nB\nC\nc")
})

test("enclosingSymbol picks the innermost definition", () => {
  const symbols = [
    { name: "Outer", role: "definition" as const, line: 1, endLine: 20 },
    { name: "inner", role: "definition" as const, line: 5, endLine: 8 },
  ]
  assert.equal(enclosingSymbol(symbols, 6), "inner")
  assert.equal(enclosingSymbol(symbols, 10), "Outer")
  assert.equal(enclosingSymbol(symbols, 30), null)
})

test("patch update equals a full re-parse: function added", async () => {
  const after = [...BASE.slice(0, 7), "function epsilon() {", "  return fetch(process.env.TOKEN_URL)", "}", "", ...BASE.slice(7)]
  await assertPatchMatchesReparse("src/a.js", BASE.join("\n"), after.join("\n"))
})

test("patch update equals a full re-parse: function deleted", async () => {
  const after = [...BASE.slice(0, 7), ...BASE.slice(11)]
  await assertPatchMatchesReparse("src/a.js", BASE.join("\n"), after.join("\n"))
})

test("patch update equals a full re-parse: body edited", async () => {
  const after = [...BASE]
  after[8] = "  return run(b, eval(b))"
  await assertPatchMatchesReparse("src/a.js", BASE.join("\n"), after.join("\n"))
})

test("patch update equals a full re-parse: lines inserted above a function", async () => {
  const after = ["// header", "// more", "", ...BASE]
  await assertPatchMatchesReparse("src/a.js", BASE.join("\n"), after.join("\n"))
})

test("intelSources reads a blob only when no patch or no prior state", () => {
  const compared = new Map([
    ["new.js", { path: "new.js", status: "added", additions: 2, deletions: 0, patch: "@@ -0,0 +1,2 @@\n+a\n+b", sha: "s1" }],
    ["edit.js", { path: "edit.js", status: "modified", additions: 1, deletions: 1, patch: "@@ -1 +1 @@\n-a\n+b", sha: "s2" }],
    ["huge.js", { path: "huge.js", status: "modified", additions: 9000, deletions: 0, sha: "s3" }],
    ["fresh.js", { path: "fresh.js", status: "modified", additions: 1, deletions: 0, patch: "@@ -1,0 +2 @@\n+x", sha: "s4" }],
    ["moved.js", { path: "moved.js", status: "renamed", additions: 0, deletions: 0, previousPath: "old.js", sha: "s5" }],
    ["chmod.sh", { path: "chmod.sh", status: "modified", additions: 0, deletions: 0, sha: "s6" }],
  ])
  const sources = intelSources([...compared.keys()], compared, new Set(["edit.js", "huge.js", "old.js", "chmod.sh"]))
  assert.deepEqual(sources.whole.map((f) => [f.path, f.text]), [["new.js", "a\nb"]])
  assert.deepEqual(sources.patched.map((f) => [f.path, f.from]), [["edit.js", "edit.js"], ["moved.js", "old.js"]])
  assert.deepEqual(sources.fetch, ["huge.js", "fresh.js"])
})
