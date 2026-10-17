import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { TERMS_COOKIE_TTL_SECONDS } from "@/lib/limits"
import { signTermsCookie, TERMS_VERSION, verifyTermsCookie } from "@/lib/terms"

const SECRET = "s".repeat(32)
const NOW = Date.UTC(2026, 9, 17)

test("the version matches the terms page's updated date", () => {
  const updated = readFileSync("content/legal/terms.md", "utf8").match(/^updated:\s*"([^"]+)"/m)?.[1]
  assert.equal(updated, TERMS_VERSION)
})

test("a signed cookie verifies to its version until it expires", () => {
  const cookie = signTermsCookie(TERMS_VERSION, SECRET, NOW)
  assert.equal(verifyTermsCookie(cookie, SECRET, NOW), TERMS_VERSION)
  assert.equal(verifyTermsCookie(cookie, SECRET, NOW + (TERMS_COOKIE_TTL_SECONDS - 1) * 1000), TERMS_VERSION)
  assert.equal(verifyTermsCookie(cookie, SECRET, NOW + TERMS_COOKIE_TTL_SECONDS * 1000), null)
})

test("a forged, re-signed or malformed cookie verifies to nothing", () => {
  const cookie = signTermsCookie(TERMS_VERSION, SECRET, NOW)
  const [expires, version, signature] = cookie.split(".")
  assert.equal(verifyTermsCookie(cookie, "x".repeat(32), NOW), null)
  assert.equal(verifyTermsCookie(`${Number(expires) + 9999}.${version}.${signature}`, SECRET, NOW), null)
  assert.equal(verifyTermsCookie(`${expires}.${Buffer.from("1 January 2020").toString("base64url")}.${signature}`, SECRET, NOW), null)
  assert.equal(verifyTermsCookie(`${cookie}.extra`, SECRET, NOW), null)
  assert.equal(verifyTermsCookie("", SECRET, NOW), null)
  assert.equal(verifyTermsCookie(`${expires}.${version}.`, SECRET, NOW), null)
})

test("a stale version still verifies, so the caller must compare it", () => {
  const cookie = signTermsCookie("1 January 2020", SECRET, NOW)
  assert.equal(verifyTermsCookie(cookie, SECRET, NOW), "1 January 2020")
})
