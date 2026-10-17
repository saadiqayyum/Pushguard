import assert from "node:assert/strict"
import { test } from "node:test"
import { AI_LIMITS, BudgetExhausted, charge, clampLimit, estimateTokens, pushMeter, refusal, runMeter, usageOf } from "@/lib/ai-budget"

test("estimates round up at four characters a token", () => {
  assert.equal(estimateTokens(""), 0)
  assert.equal(estimateTokens("abcde"), 2)
})

test("a stored limit is clamped to its ceiling and defaults when absent", () => {
  assert.equal(clampLimit("maxOutputTokens", null), AI_LIMITS.maxOutputTokens.default)
  assert.equal(clampLimit("maxOutputTokens", 0), AI_LIMITS.maxOutputTokens.default)
  assert.equal(clampLimit("maxOutputTokens", 10_000_000), AI_LIMITS.maxOutputTokens.ceiling)
  assert.equal(clampLimit("timeoutMs", 12_345.9), 12_345)
})

test("a call that would pass the run budget is refused before it is made", () => {
  const meter = runMeter(pushMeter(1_000_000), 1_000)
  assert.equal(refusal(meter, 900, 100), null)
  charge(meter, { input: 900, output: 50 })
  const refused = refusal(meter, 200, 100)
  assert.ok(refused instanceof BudgetExhausted)
  assert.equal(refused.scope, "run")
  assert.equal(refused.remaining, 100)
})

test("the push budget counts output at its cap and is shared across runs", () => {
  const push = pushMeter(5_000)
  const first = runMeter(push, 100_000)
  charge(first, { input: 3_000, output: 1_000 })
  const second = runMeter(push, 100_000)
  assert.equal(refusal(second, 500, 400), null)
  assert.equal(refusal(second, 500, 600)?.scope, "push")
  assert.equal(push.spent, 4_000)
})

test("usage is read from usage_metadata, then from each provider's own fields", () => {
  assert.deepEqual(usageOf({ usage_metadata: { input_tokens: 10, output_tokens: 3, total_tokens: 13 }, response_metadata: {} }), { input: 10, output: 3 })
  assert.deepEqual(usageOf({ usage_metadata: undefined, response_metadata: { usage: { prompt_tokens: 7, completion_tokens: 2 } } }), { input: 7, output: 2 })
  assert.deepEqual(usageOf({ usage_metadata: undefined, response_metadata: { usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1 } } }), { input: 5, output: 1 })
  assert.equal(usageOf({ usage_metadata: undefined, response_metadata: {} }), null)
})
