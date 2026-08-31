import assert from "node:assert/strict"
import { test } from "node:test"
import { MAX_TOKENS_PER_FILE, normalizeSymbol, tokenize } from "@/lib/tokens"

test("identifiers are found across languages without a parser", () => {
  const ts = tokenize("export function readSecret(vault) { return vault.getToken() }")
  assert.ok(ts.includes("readsecret"))
  assert.ok(ts.includes("gettoken"))
  assert.ok(ts.includes("vault"))

  const py = tokenize("def read_secret(vault):\n    return vault.get_token()")
  assert.ok(py.includes("read_secret"))
  assert.ok(py.includes("get_token"))

  const go = tokenize("func ReadSecret(v *Vault) string { return v.GetToken() }")
  assert.ok(go.includes("readsecret"), "case is folded, so Go exports match camelCase searches")
})

test("a search finds the file whatever case it was written in", () => {
  const tokens = tokenize("const GetUser = 1")
  assert.ok(tokens.includes(normalizeSymbol("getUser")))
  assert.ok(tokens.includes(normalizeSymbol("  GETUSER  ")))
})

test("keywords and short names are not indexed", () => {
  const tokens = tokenize("for (let i = 0; i < n; i++) { if (true) return null }")
  for (const noise of ["for", "let", "return", "null", "true"]) {
    assert.ok(!tokens.includes(noise), `${noise} would be in every file and narrow nothing`)
  }
  assert.ok(!tokens.includes("i"), "one character is not a searchable name")
})

test("a generated file cannot make one document unbounded", () => {
  const generated = Array.from({ length: 5000 }, (_, i) => `const symbol${i} = ${i}`).join("\n")
  assert.equal(tokenize(generated).length, MAX_TOKENS_PER_FILE)
})

test("tokens are distinct", () => {
  const tokens = tokenize("alpha alpha alpha beta")
  assert.deepEqual([...tokens].sort(), ["alpha", "beta"])
})
