import assert from "node:assert/strict"
import { test } from "node:test"
import { filterCitations, inputUrls, validateDraft } from "@/lib/contributor/validate"
import { AppError } from "@/lib/errors"
import { platformAccess } from "@/lib/platform/access"
import { checkTransition, type GateEvidence } from "@/lib/platform/lifecycle"
import { ADMIN_SESSION_MAX_AGE_SECONDS, SHADOW_MIN_MS } from "@/lib/platform/limits"
import { canonicalJson, generateSigningKeys, signingPayload, signPayload, verifyPayload } from "@/lib/platform/signing"

const NOW = 1_800_000_000

test("platform admin gating: everyone outside the list gets the same 404", () => {
  const admins = ["octo-staff"]
  assert.equal(platformAccess(null, admins, NOW), "not_found")
  assert.equal(platformAccess({ login: "someone", signedInAt: NOW }, admins, NOW), "not_found")
  assert.equal(platformAccess({ login: "", signedInAt: NOW }, admins, NOW), "not_found")
  assert.equal(platformAccess({ login: "someone", signedInAt: NOW }, [], NOW), "not_found")
  assert.equal(new AppError("not_found", "Not found").status, 404)
})

test("platform admin gating: listed logins pass only with a fresh sign-in", () => {
  const admins = ["octo-staff"]
  assert.equal(platformAccess({ login: "Octo-Staff", signedInAt: NOW - 60 }, admins, NOW), "ok")
  assert.equal(platformAccess({ login: "octo-staff", signedInAt: NOW - ADMIN_SESSION_MAX_AGE_SECONDS - 1 }, admins, NOW), "reauth")
  assert.equal(platformAccess({ login: "octo-staff", signedInAt: 0 }, admins, NOW), "reauth")
})

const clean: GateEvidence = { schemaProblems: [], regexProblems: [], fixtures: { passed: true, failures: [] }, shadowSince: null }
const at = new Date("2026-10-17T00:00:00Z")

test("lifecycle: only listed transitions are allowed", () => {
  assert.equal(checkTransition({ from: "draft", to: "published", now: at }, clean).ok, false)
  assert.equal(checkTransition({ from: "retired", to: "draft", now: at }, clean).ok, false)
  assert.equal(checkTransition({ from: "draft", to: "review", now: at }, clean).ok, true)
})

test("lifecycle: forward moves need a valid schema, safe regexes and passing fixtures", () => {
  const verdict = checkTransition(
    { from: "review", to: "shadow", now: at },
    { ...clean, regexProblems: ["Unsafe regular expression"], fixtures: { passed: false, failures: ["benign hit"] } },
  )
  assert.equal(verdict.ok, false)
  assert.deepEqual(!verdict.ok && verdict.problems, ["Unsafe regular expression", "benign hit"])
  assert.equal(checkTransition({ from: "draft", to: "review", now: at }, { ...clean, schemaProblems: ["title: Required"] }).ok, false)
})

test("lifecycle: moving back is never gated", () => {
  const broken = { ...clean, schemaProblems: ["broken"], fixtures: { passed: false, failures: [] } }
  assert.equal(checkTransition({ from: "shadow", to: "draft", now: at }, broken).ok, true)
  assert.equal(checkTransition({ from: "published", to: "retired", now: at }, broken).ok, true)
})

test("lifecycle: publishing needs the shadow period or an override reason", () => {
  const early = { ...clean, shadowSince: new Date(at.getTime() - SHADOW_MIN_MS + 1) }
  const late = { ...clean, shadowSince: new Date(at.getTime() - SHADOW_MIN_MS) }
  assert.equal(checkTransition({ from: "shadow", to: "published", now: at }, early).ok, false)
  assert.equal(checkTransition({ from: "shadow", to: "published", now: at }, { ...clean }).ok, false)
  assert.equal(checkTransition({ from: "shadow", to: "published", now: at, override: "short" }, early).ok, false)
  assert.deepEqual(checkTransition({ from: "shadow", to: "published", now: at, override: "Active campaign, customers exposed" }, early), {
    ok: true,
    overridden: true,
  })
  assert.deepEqual(checkTransition({ from: "shadow", to: "published", now: at }, late), { ok: true, overridden: false })
})

test("signing: round trip, key order independence, tamper and wrong-key rejection", () => {
  const keys = generateSigningKeys()
  const other = generateSigningKeys()
  const body = { title: "x", when: { lines: { op: "contains", values: ["a"] } } }
  const signature = signPayload(signingPayload("pb", 2, body), keys.privateKey)
  assert.equal(verifyPayload(signingPayload("pb", 2, { when: body.when, title: "x" }), signature, keys.publicKey), true)
  assert.equal(verifyPayload(signingPayload("pb", 3, body), signature, keys.publicKey), false)
  assert.equal(verifyPayload(signingPayload("pb", 2, { ...body, title: "y" }), signature, keys.publicKey), false)
  assert.equal(verifyPayload(signingPayload("pb", 2, body), signature, other.publicKey), false)
  assert.equal(verifyPayload(signingPayload("pb", 2, body), "not-base64!", keys.publicKey), false)
  assert.equal(canonicalJson({ b: 1, a: [{ d: 1, c: 2 }] }), '{"a":[{"c":2,"d":1}],"b":1}')
})

const fixture = (name: string, line: string) => ({ name, commits: [{ files: [{ path: "src/index.js", change: "added", added: [line] }] }] })

const draft = (values: string[], op = "contains") => ({
  id: "test-marker",
  version: 99,
  status: "published",
  description: "Marker",
  severity: "high",
  pack: "core",
  explanation: "Test",
  incidents: [
    { name: "Real", date: "2026-01", url: "https://example.com/report" },
    { name: "Invented", date: "2026-01", url: "https://attacker.example/fake" },
  ],
  references: [{ title: "Advisory", url: "https://github.com/advisories/GHSA-xxxx-xxxx-xxxx." }],
  docs: ["docs/attacks/packages/axios-2026.md"],
  advanced: { when: { lines: { op, values } } },
  fixtures: { malicious: [fixture("hit", "evil_marker()")], benign: [fixture("clean", "good()")] },
})

test("contributor: citations limited to URLs present in the input", () => {
  const allowed = inputUrls(["See https://example.com/report, and https://github.com/advisories/GHSA-xxxx-xxxx-xxxx."], [])
  const { draft: filtered, dropped } = filterCitations(draft(["evil_marker"]), allowed, new Set())
  assert.deepEqual((filtered.incidents as { name: string }[]).map((i) => i.name), ["Real"])
  assert.equal((filtered.references as unknown[]).length, 1)
  assert.equal(filtered.docs, undefined)
  assert.deepEqual(dropped.sort(), ["docs/attacks/packages/axios-2026.md", "https://attacker.example/fake"])
  assert.equal(inputUrls(["http://plain.example/x"], ["javascript:alert(1)"]).size, 0)
})

test("contributor: a valid draft drops version and status and its fixtures run", async () => {
  const verdict = await validateDraft(draft(["evil_marker"]), {
    allowedUrls: new Set(["https://example.com/report"]),
    allowedDocs: new Set(),
  })
  assert.equal(verdict.valid, true, verdict.problems.join("; "))
  assert.equal(verdict.rule?.id, "test-marker")
  assert.equal("version" in verdict.body, false)
  assert.equal(verdict.fixtures?.passed, true)
  assert.deepEqual(verdict.problems, [])
})

test("contributor: schema-invalid and regex-unsafe drafts are marked invalid", async () => {
  const context = { allowedUrls: new Set<string>(), allowedDocs: new Set<string>() }
  const missing = await validateDraft({ id: "x" }, context)
  assert.equal(missing.valid, false)
  assert.ok(missing.problems.length > 0)

  const unsafe = await validateDraft(draft(["(a+)+$"], "matches"), context)
  assert.equal(unsafe.valid, false)
  assert.equal(unsafe.fixtures, null)
  assert.match(unsafe.problems[0], /Unsafe regular expression/)

  const shipped = await validateDraft({ ...draft(["evil_marker"]), id: "force-push" }, context)
  assert.equal(shipped.valid, false)
})
