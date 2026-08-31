import assert from "node:assert/strict"
import { test } from "node:test"
import { hint, open, seal } from "@/lib/secret-box"

process.env.ENCRYPTION_KEY ??= "0".repeat(64)

const KEY = "sk-ant-api03-not-a-real-key-0123456789"

test("a sealed key opens back to itself", () => {
  assert.equal(open(seal(KEY)), KEY)
})

test("the same key seals differently every time", () => {
  // A fresh IV per encryption. Without it, two accounts using the same key
  // would store identical ciphertext and the database would leak that fact.
  const a = seal(KEY)
  const b = seal(KEY)
  assert.notEqual(a.ciphertext, b.ciphertext)
  assert.notEqual(a.iv, b.iv)
  assert.equal(open(a), open(b))
})

test("the plaintext never appears in what is stored", () => {
  const sealed = seal(KEY)
  const stored = JSON.stringify(sealed)
  assert.ok(!stored.includes(KEY))
  assert.ok(!stored.includes("sk-ant"))
})

test("a tampered ciphertext will not open", () => {
  // GCM authenticates as well as encrypts: an altered row fails to open rather
  // than decrypting to something else.
  const sealed = seal(KEY)
  const flipped = Buffer.from(sealed.ciphertext, "base64")
  flipped[0] ^= 0xff
  assert.equal(open({ ...sealed, ciphertext: flipped.toString("base64") }), null)
  assert.equal(open({ ...sealed, tag: seal("other").tag }), null)
})

test("a wrong encryption key returns null rather than throwing", () => {
  // ENCRYPTION_KEY rotated. Model review stops for that account; the alert for
  // the push that triggered it must still be filed.
  const sealed = seal(KEY)
  const original = process.env.ENCRYPTION_KEY
  process.env.ENCRYPTION_KEY = "1".repeat(64)
  assert.equal(open(sealed), null)
  process.env.ENCRYPTION_KEY = original
})

test("the hint identifies a key without revealing it", () => {
  const masked = hint(KEY)
  assert.ok(masked.length < KEY.length)
  assert.ok(!masked.includes("api03-not-a-real"))
  // Suffix only. The prefix used to be shown, which is harmless for an
  // Anthropic key and real key material for a provider without a fixed one.
  assert.ok(!masked.includes("sk-"))
  assert.ok(masked.endsWith(KEY.slice(-4)))
  // Short values are masked entirely rather than mostly shown.
  assert.equal(hint("short"), "••••")
})
