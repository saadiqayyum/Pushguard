import assert from "node:assert/strict"
import { test } from "node:test"
import { resolveAlertTarget } from "@/lib/alert-target"
import { findingsMarkdown } from "@/lib/finding"

test("alerts land in the repo that triggered them, private or not", () => {
  assert.equal(resolveAlertTarget("acme/api", true).repo, "acme/api")
  assert.equal(resolveAlertTarget("acme/docs", false).repo, "acme/docs")
})

test("a public target withholds matched content, a private one quotes it", () => {
  assert.equal(resolveAlertTarget("acme/api", true).redactContent, false)
  assert.equal(resolveAlertTarget("acme/docs", false).redactContent, true)
})

const finding = {
  ruleId: "env-file-committed",
  severity: "critical" as const,
  repo: "acme/docs",
  files: [".env"],
  lines: ["SECRET_KEY=sk-live-1"],
}

test("a public issue never contains the matched line", () => {
  const body = findingsMarkdown([finding], true).join("\n")
  assert.ok(!body.includes("sk-live-1"), "secret must not reach a world-readable issue")
  assert.ok(body.includes("env-file-committed"), "the rule is still named")
  assert.ok(body.includes(".env"), "the file is still named")
  assert.ok(body.includes("withheld"), "and the reader is told why")
})

test("a private issue still quotes the line", () => {
  assert.ok(findingsMarkdown([finding]).join("\n").includes("sk-live-1"))
})

test("redaction says nothing when a finding had no lines to withhold", () => {
  const pathOnly = { ...finding, lines: [] }
  assert.ok(!findingsMarkdown([pathOnly], true).join("\n").includes("withheld"))
})

import { erasureMarkdown } from "@/lib/finding"

const forensics = {
  erasedCommits: [{ sha: "a155ffccb23d5fb074ade3949538cd51b98315c5", message: "wip", author: "mallory" }],
  erasedCommitCount: 1,
  erasedFiles: [".env"],
  findings: [finding],
  mergeBase: "883e5a678c16f36e18446481fb8228d0dedb1e41",
  truncated: false,
}

test("the erasure section names the commits and links the orphaned range", () => {
  const body = erasureMarkdown(forensics, "acme/docs", "a155ffccb23d5fb074ade3949538cd51b98315c5").join("\n")
  assert.ok(body.includes("1 commit unreachable"), "says how much was erased")
  assert.ok(body.includes("a155ffc"), "names the erased commit")
  assert.ok(body.includes("@mallory"), "names who authored it")
  assert.ok(body.includes("compare/883e5a6...a155ffc"), "links merge base to the orphaned tip")
})

test("the erasure section never quotes content itself", () => {
  const body = erasureMarkdown(forensics, "acme/docs", "a155ffc").join("\n")
  assert.ok(!body.includes("sk-live-1"), "quoting is findingsMarkdown's job, and it redacts")
})
