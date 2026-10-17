import assert from "node:assert/strict"
import { test } from "node:test"
import { bearerToken, hashMcpToken, MCP_TOKEN_PREFIX, newMcpToken, repoAllowed } from "@/lib/mcp-auth"

test("a new token is prefixed, unique, and stored only as its hash", () => {
  const a = newMcpToken()
  const b = newMcpToken()
  assert.ok(a.token.startsWith(MCP_TOKEN_PREFIX))
  assert.notEqual(a.token, b.token)
  assert.equal(a.hash, hashMcpToken(a.token))
  assert.match(a.hash, /^[0-9a-f]{64}$/)
  assert.ok(!a.hash.includes(a.token))
  assert.equal(a.hint, a.token.slice(-4))
})

test("only a Bearer header carrying one of our tokens is accepted", () => {
  const { token } = newMcpToken()
  assert.equal(bearerToken(`Bearer ${token}`), token)
  assert.equal(bearerToken(token), null)
  assert.equal(bearerToken("Bearer ghp_something"), null)
  assert.equal(bearerToken(null), null)
  assert.equal(bearerToken(`Bearer ${"x".repeat(500)}`), null)
})

test("a token reaches only its own org's repositories", () => {
  assert.ok(repoAllowed("acme", "acme/api", { org: "acme" }))
  assert.ok(repoAllowed("Acme", "acme/api", { org: "acme" }))
  assert.equal(repoAllowed("acme", "other/api", { org: "other" }), false)
  assert.equal(repoAllowed("acme", "acme/unknown", null), false)
  assert.equal(repoAllowed("acme", "acme/../x/y", { org: "acme" }), false)
})
