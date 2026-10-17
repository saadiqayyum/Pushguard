import assert from "node:assert/strict"
import { test } from "node:test"
import { clickAction } from "@/lib/session-check"

test("signed in navigates, signed out opens the dialog, unknown waits for the check", () => {
  assert.equal(clickAction("signed-in"), "navigate")
  assert.equal(clickAction("signed-out"), "dialog")
  assert.equal(clickAction("unknown"), "wait")
})
