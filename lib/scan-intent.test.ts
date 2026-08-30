import assert from "node:assert/strict"
import { test } from "node:test"
import { parseIntentParam, parseScanIntent } from "@/lib/scan-intent"

test("a deep link names an account, or an account and a repository", () => {
  assert.deepEqual(parseScanIntent(["acme"]), { account: "acme", repo: null, path: "/scan/acme" })
  assert.deepEqual(parseScanIntent(["acme", "api"]), {
    account: "acme",
    repo: "acme/api",
    path: "/scan/acme/api",
  })
})

test("deeper paths keep their first two segments", () => {
  assert.equal(parseScanIntent(["acme", "api", "tree", "main"])?.path, "/scan/acme/api")
})

test("anything that could escape the path is rejected", () => {
  // The path is echoed into a post-sign-in redirect, so this is the open-redirect
  // guard, not a nicety.
  for (const segments of [
    undefined,
    [],
    [""],
    ["acme", ".."],
    ["acme", "."],
    ["..", "api"],
    ["acme", "..."],
    ["", "evil.com"],
    ["acme/api"],
    ["acme", "api?x=1"],
    ["a".repeat(101)],
  ]) {
    assert.equal(parseScanIntent(segments as string[] | undefined), null, JSON.stringify(segments))
  }
})

test("the same rules apply to a target arriving as one string", () => {
  assert.equal(parseIntentParam("acme/api")?.repo, "acme/api")
  assert.equal(parseIntentParam("acme")?.repo, null)
  assert.equal(parseIntentParam(null), null)
  assert.equal(parseIntentParam("//evil.com"), null)
})
