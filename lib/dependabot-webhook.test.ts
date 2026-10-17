import assert from "node:assert/strict"
import { test } from "node:test"
import { isMalwareAdvisory } from "@/lib/webhook/advisory"

test("a Dependabot alert counts as malware only by type, CWE-506 or the malicious summary", () => {
  assert.equal(isMalwareAdvisory({ type: "malware", cwes: [], summary: "x" }), true)
  assert.equal(isMalwareAdvisory({ cwes: [{ cwe_id: "CWE-506" }], summary: "x" }), true)
  assert.equal(isMalwareAdvisory({ cwes: [], summary: "Malicious code in chalk (npm)" }), true)
  assert.equal(isMalwareAdvisory({ cwes: [{ cwe_id: "CWE-79" }], summary: "XSS in foo" }), false)
})
