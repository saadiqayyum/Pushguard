import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { test } from "node:test"
import { MAX_LABEL_DESCRIPTION, MAX_LABEL_NAME, RUNNER_LABEL_PREFIX } from "@/lib/runner/limits"
import { runnerLabel } from "@/lib/runner/target"
import { runnerFetchSchema } from "@/schemas/runner"

const nonce = randomBytes(32).toString("base64url")

test("label carries the nonce in its name and the kind and endpoint in its description", () => {
  const label = runnerLabel(nonce, "detonate", "https://pushguard.example.com/api/runner")
  assert.ok(label)
  assert.equal(label.name.length, 46)
  assert.ok(label.name.length <= MAX_LABEL_NAME)
  assert.equal(label.description, "pushguard:detonate https://pushguard.example.com/api/runner")
  const extracted = label.name.slice(RUNNER_LABEL_PREFIX.length)
  assert.equal(extracted, nonce)
  assert.ok(runnerFetchSchema.safeParse({ nonce: extracted }).success)
})

test("a label GitHub would truncate is refused", () => {
  assert.equal(runnerLabel(nonce, "scan", `https://${"a".repeat(MAX_LABEL_DESCRIPTION)}.example/api/runner`), null)
  assert.equal(runnerLabel(`${nonce}${"x".repeat(10)}`, "scan", "https://p.example/api/runner"), null)
})
