import assert from "node:assert/strict"
import { test } from "node:test"
import { INSTALL_START, signinDestination } from "@/lib/signin"

test("next is kept only for same-origin app paths", () => {
  assert.equal(signinDestination("/dashboard/alerts"), "/dashboard/alerts")
  assert.equal(signinDestination("/admin"), "/admin")
  assert.equal(signinDestination(INSTALL_START), INSTALL_START)
  for (const bad of ["https://evil.test", "//evil.test", "/dashboard/../api", "/\\evil.test", "/api/alerts", "javascript:alert(1)", null]) {
    assert.equal(signinDestination(bad), "/dashboard")
  }
})
