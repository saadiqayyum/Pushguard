import assert from "node:assert/strict"
import { test } from "node:test"
import { scanRange } from "@/lib/scan-range"

const commit = (sha: string, parent?: string) => ({
  sha,
  parents: parent ? [{ sha: parent }] : [],
})

test("the oldest commit in the window is read, not skipped past", () => {
  // The bug: basing the compare on the oldest commit in the window reports only
  // what changed AFTER it, so everything that commit introduced was invisible.
  // On a repository shorter than the window that is the initial commit, and the
  // scan called a repository full of planted files clean.
  const window = [commit("f", "e"), commit("e", "d"), commit("d", "c")]
  const range = scanRange(window)
  assert.deepEqual(range, { kind: "compare", base: "c", head: "f" })
})

test("a window that reaches the repository root reads the root directly", () => {
  // The root has no parent, so no compare can show what it added.
  const window = [commit("c", "b"), commit("b", "a"), commit("a")]
  assert.deepEqual(scanRange(window), { kind: "root", root: "a", head: "c" })
})

test("a single-commit repository is read as one commit", () => {
  assert.deepEqual(scanRange([commit("a")]), { kind: "single", ref: "a" })
})

test("an empty repository has no range", () => {
  assert.equal(scanRange([]), null)
})
