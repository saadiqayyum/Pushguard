import assert from "node:assert/strict"
import { test } from "node:test"
import { MAX_HUNK_CHARS, renderDiffContext } from "@/lib/diff-context"
import type { CompareFile } from "@/lib/github"

const file = (over: Partial<CompareFile> = {}): CompareFile => ({
  path: "src/a.ts",
  status: "modified",
  additions: 3,
  deletions: 1,
  patch: "@@ -1 +1,3 @@\n+const a = 1",
  ...over,
})

test("every changed file is named even when its diff does not fit", () => {
  // The failure this prevents: a file silently absent from the context reads to
  // the model as a file that did not change.
  const huge = Array.from({ length: 800 }, (_, i) => `+line ${i} ${"x".repeat(60)}`).join("\n")
  const files = [
    file({ path: "src/first.ts", patch: huge }),
    file({ path: "src/second.ts", patch: huge }),
  ]
  const ctx = renderDiffContext(files, null)
  assert.ok(ctx.text.includes("src/first.ts"))
  assert.ok(ctx.text.includes("src/second.ts"))
  assert.ok(ctx.truncated, "dropping a diff must be reported")
  assert.match(ctx.text, /did not fit/)
})

test("hunks stay inside the budget", () => {
  const files = Array.from({ length: 50 }, (_, i) =>
    file({ path: `src/f${i}.ts`, patch: "+x".repeat(5_000) }),
  )
  const ctx = renderDiffContext(files, null)
  assert.ok(ctx.text.length < MAX_HUNK_CHARS * 1.5)
})

test("stats say what changed, not just that something did", () => {
  const ctx = renderDiffContext(
    [file({ path: "src/auth.ts", status: "modified", additions: 40, deletions: 2 })],
    null,
  )
  assert.match(ctx.text, /src\/auth\.ts \(modified, \+40\/-2\)/)
})

test("a dependency advisory is surfaced in the orientation", () => {
  const ctx = renderDiffContext(
    [file()],
    [
      {
        name: "left-pad",
        version: "1.0.0",
        ecosystem: "npm",
        manifest: "package.json",
        vulnerabilities: [
          { severity: "critical", summary: "remote code execution", advisory: "GHSA-xxxx" },
        ],
      },
    ],
  )
  assert.match(ctx.text, /npm:left-pad@1\.0\.0/)
  assert.match(ctx.text, /critical: remote code execution/)
  assert.match(ctx.text, /GHSA-xxxx/)
})

test("a range with no diff still renders", () => {
  const ctx = renderDiffContext([], null)
  assert.match(ctx.text, /changed 0 files/)
  assert.equal(ctx.truncated, false)
  assert.deepEqual(ctx.seeds, [])
})

test("seeds are the changed files, for an agent that starts blind", () => {
  const ctx = renderDiffContext([file({ path: "a.ts" }), file({ path: "b.ts" })], null)
  assert.deepEqual(ctx.seeds, ["a.ts", "b.ts"])
})
