import assert from "node:assert/strict"
import { test } from "node:test"
import { resolveAlertTarget } from "@/lib/alert-target"

test("alerts land in the private repo that triggered them", () => {
  assert.equal(resolveAlertTarget("acme/api", true), "acme/api")
})

test("a public source repo is never a target", () => {
  assert.equal(resolveAlertTarget("acme/docs", false), null)
})
