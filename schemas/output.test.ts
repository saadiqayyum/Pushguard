import assert from "node:assert/strict"
import { test } from "node:test"
import { serializeResolvedRule } from "@/lib/rules"
import { catalogRules } from "@/lib/rules/catalog"
import { aiKeyOut, ruleRowOut } from "@/schemas/output"

test("every catalog rule passes the rule output schema", () => {
  for (const rule of catalogRules) {
    const out = ruleRowOut.parse(serializeResolvedRule({ ...rule, origin: "catalog" }))
    assert.equal("origin" in out.body, false)
  }
})

test("the key output schema drops sealed columns", () => {
  const out = aiKeyOut.parse({
    id: "k",
    label: "l",
    provider: "anthropic",
    keyHint: "sk-...abcd",
    model: "m",
    effort: "low",
    ciphertext: "secret",
    iv: "iv",
    tag: "tag",
  })
  assert.equal(JSON.stringify(out).includes("secret"), false)
})
