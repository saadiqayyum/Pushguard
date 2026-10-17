import assert from "node:assert/strict"
import { test } from "node:test"
import { addedLinesByFile } from "./diff-lines"

const diff = [
  "diff --git a/package.json b/package.json",
  "--- a/package.json",
  "+++ b/package.json",
  "@@ -1,2 +1,3 @@",
  ' "name": "x",',
  '+  "postinstall": "node x.js",',
  "-- a/README.md",
  "+++ b/README.md",
  "diff --git a/README.md b/README.md",
  "new file mode 100644",
  "--- /dev/null",
  "+++ b/README.md",
  "@@ -0,0 +1 @@",
  "+hello",
].join("\n")

test("added lines are attributed to the file whose header precedes them", () => {
  assert.deepEqual(
    addedLinesByFile(diff),
    new Map([
      ["package.json", ['  "postinstall": "node x.js",', "++ b/README.md"]],
      ["README.md", ["hello"]],
    ]),
  )
})

test("lines with no header go to the fallback paths", () => {
  assert.deepEqual(addedLinesByFile("+a\n b\n+c", ["x.ts"]), new Map([["x.ts", ["a", "c"]]]))
  assert.deepEqual(addedLinesByFile("@@ -1 +1 @@\n+a", ["x.ts"]), new Map([["x.ts", ["a"]]]))
})
