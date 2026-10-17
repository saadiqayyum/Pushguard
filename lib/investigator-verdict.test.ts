import assert from "node:assert/strict"
import { test } from "node:test"
import { escalations, investigationSchema, mergeReadings, reviewerDirectedFinding, type Investigation } from "@/lib/investigator-verdict"

const reading = (overall: Investigation["overall"], verdicts: Investigation["overall"][]): Investigation => ({
  overall,
  summary: "",
  reviewerDirected: [],
  hops: verdicts.map((verdict, i) => ({ hop: i + 1, verdict, reason: `r${i}`, evidence: [{ path: "a.ts", line: i + 1 }] })),
})

test("the verdict schema rejects a verdict outside the four", () => {
  assert.equal(investigationSchema.safeParse({ ...reading("benign", []), overall: "clean" }).success, false)
  assert.equal(investigationSchema.safeParse(reading("suspicious", ["benign"])).success, true)
})

test("stripped and full readings that disagree make the hop suspicious", () => {
  const merged = mergeReadings([reading("benign", ["malicious", "benign"]), reading("benign", ["benign", "benign"])], 2)
  assert.equal(merged.hops[0].verdict, "malicious")
  assert.deepEqual(merged.disagreements, [1])
  assert.equal(merged.overall, "malicious")
})

test("a split between benign and unknown is not a disagreement", () => {
  const merged = mergeReadings([reading("benign", ["benign"]), reading("unknown", ["unknown"])], 1)
  assert.deepEqual(merged.disagreements, [])
  assert.equal(merged.overall, "unknown")
})

test("a missing hop counts as unknown, never benign", () => {
  const merged = mergeReadings([reading("benign", [])], 2)
  assert.ok(merged.hops.every((h) => h.verdict === "unknown"))
})

test("escalate-only: benign adds nothing, malicious adds a critical finding", () => {
  assert.deepEqual(escalations("acme/api", ["a.ts"], mergeReadings([reading("benign", ["benign"])], 1)), [])
  const out = escalations("acme/api", ["a.ts"], mergeReadings([reading("malicious", ["malicious"])], 1))
  assert.equal(out[0].ruleId, "ai-investigation-malicious")
  assert.equal(out[0].severity, "critical")
})

test("disagreement is filed as its own finding", () => {
  const out = escalations("acme/api", [], mergeReadings([reading("benign", ["suspicious"]), reading("benign", ["benign"])], 1))
  assert.ok(out.some((f) => f.ruleId === "ai-comment-disagreement"))
  assert.ok(out.some((f) => f.ruleId === "ai-investigation-suspicious"))
})

test("model prose cannot ping users or render links", () => {
  const r = reading("malicious", ["malicious"])
  r.hops[0].reason = "@security-team see ![x](https://evil.example/?d=1)"
  const [finding] = escalations("acme/api", [], mergeReadings([r], 1))
  const text = finding.lines.join(" ")
  assert.ok(!/(^|\s)@security-team/.test(text))
  assert.ok(!text.includes("](") && !text.includes("https://"))
})

test("reviewer-directed quotes are filed as code lines, not prose", () => {
  const finding = reviewerDirectedFinding("acme/api", [{ path: "a.ts", line: 2, quote: "// security reviewed" }])
  assert.equal(finding?.ruleId, "reviewer-directed-text")
  assert.equal(finding?.prose, undefined)
  assert.equal(reviewerDirectedFinding("acme/api", []), null)
})
