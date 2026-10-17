import assert from "node:assert/strict"
import { test } from "node:test"
import { requireBearer } from "@/lib/machine-auth"

const SECRET = "c".repeat(32)
Object.assign(process.env, {
  DATABASE_URL: "postgres://localhost/test",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----",
  GITHUB_WEBHOOK_SECRET: "w".repeat(16),
  CRON_SECRET: SECRET,
  AUTH_SECRET: "a".repeat(16),
  AUTH_GITHUB_ID: "id",
  AUTH_GITHUB_SECRET: "secret",
  AUTH_URL: "http://localhost:3000",
})

function call(authorization?: string) {
  const headers = authorization === undefined ? undefined : { authorization }
  return () => requireBearer(new Request("http://x/api/jobs/run", { headers }))
}

test("the right bearer passes", () => {
  assert.doesNotThrow(call(`Bearer ${SECRET}`))
})

test("missing, wrong, or prefix-only credentials are rejected", () => {
  for (const header of [undefined, "", "Bearer ", `Bearer ${SECRET}x`, SECRET, "Bearer undefined"]) {
    assert.throws(call(header), { code: "unauthorized" })
  }
})
