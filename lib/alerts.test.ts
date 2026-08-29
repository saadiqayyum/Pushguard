import assert from "node:assert/strict"
import { test } from "node:test"
import { resolveAlertTarget } from "@/lib/alert-target"

test("alerts land in the private repo that triggered them", () => {
  assert.equal(resolveAlertTarget(null, "acme/api", true), "acme/api")
})

test("a public source repo is never a target without an explicit choice", () => {
  assert.equal(resolveAlertTarget(null, "acme/docs", false), null)
})

test("a configured alerts repo wins for both public and private sources", () => {
  assert.equal(resolveAlertTarget("acme/security-alerts", "acme/api", true), "acme/security-alerts")
  assert.equal(resolveAlertTarget("acme/security-alerts", "acme/docs", false), "acme/security-alerts")
})
