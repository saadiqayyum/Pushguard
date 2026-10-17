import assert from "node:assert/strict"
import { test } from "node:test"
import { buildMatcher, matchIndicators, type Indicator } from "@/lib/indicators"

const ind = (kind: Indicator["kind"], value: string): Indicator => ({ kind, value, campaign: "c", actorName: null, references: [] })

const matcher = buildMatcher([
  ind("domain", "evil.example"),
  ind("ip", "203.0.113.7"),
  ind("wallet", "0xAbC123"),
  ind("url", "https://hooks.example/abc"),
  ind("string", "Second Coming"),
  ind("file_name", "setup_payload.js"),
  ind("file_name", ".github/workflows/bad.yml"),
  ind("package", "npm:x@1.0.0"),
])

const values = (lines: string[], paths: string[] = []) => matchIndicators(matcher, lines, paths).map((i) => i.value).sort()

test("domains match as tokens, including subdomains and inside URLs", () => {
  assert.deepEqual(values(['fetch("https://api.evil.example/x")']), ["evil.example"])
  assert.deepEqual(values(["notevil.example.com", "evil.examples"]), [])
})

test("IPs, wallets and case-insensitive substrings", () => {
  assert.deepEqual(values(["connect('203.0.113.7:443')", "to = '0xabc123'"]), ["0xAbC123", "203.0.113.7"])
  assert.deepEqual(values(["curl HTTPS://hooks.example/abc?d=1", "// the second coming"]), ["Second Coming", "https://hooks.example/abc"])
  assert.deepEqual(values(["203.0.113.70"]), [])
})

test("file names match by basename or full path, and package indicators are ignored", () => {
  assert.deepEqual(values([], ["pkg/setup_payload.js", ".github/workflows/bad.yml", "src/x.js"]), [".github/workflows/bad.yml", "setup_payload.js"])
  assert.deepEqual(values(["npm:x@1.0.0"]), [])
})

test("each indicator is reported once", () => {
  assert.equal(matchIndicators(matcher, ["evil.example", "evil.example"], []).length, 1)
})
