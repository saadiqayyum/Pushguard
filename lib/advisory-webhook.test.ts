import assert from "node:assert/strict"
import { test } from "node:test"
import { isMalwareAdvisory } from "@/lib/webhook/advisory"

test("malware is told apart from vulnerabilities without a type field", () => {
  assert.ok(isMalwareAdvisory({ summary: "Malicious code in chalk (npm)", cwes: [] }))
  assert.ok(isMalwareAdvisory({ summary: "Backdoor", cwes: [{ cwe_id: "CWE-506" }] }))
  assert.ok(!isMalwareAdvisory({ summary: "Prototype pollution in lodash", cwes: [{ cwe_id: "CWE-1321" }] }))
  assert.ok(!isMalwareAdvisory({ type: "reviewed", summary: "Malicious input causes DoS", cwes: [] }))
})

test("a vulnerability summary starting with the word malicious is not malware", () => {
  assert.ok(!isMalwareAdvisory({ summary: "Malicious input causes DoS", cwes: [] }))
})
