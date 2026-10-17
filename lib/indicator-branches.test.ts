import assert from "node:assert/strict"
import { test } from "node:test"
import { readsDiffFor } from "@/lib/indicator-branches"

test("the default branch is always checked, others only when listed", () => {
  assert.equal(readsDiffFor("main", "main", null), true)
  assert.equal(readsDiffFor("feature/x", "main", null), false)
  assert.equal(readsDiffFor("release/1.2", "main", ["release/*"]), true)
  assert.equal(readsDiffFor("release/1.2/hotfix", "main", ["release/*"]), false)
  assert.equal(readsDiffFor("dev", "main", []), false)
})
