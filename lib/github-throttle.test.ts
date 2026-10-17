import assert from "node:assert/strict"
import { test } from "node:test"
import {
  classifyGitHubError,
  GITHUB_FALLBACK_RETRY_AFTER_SECONDS,
  GITHUB_MAX_RATE_LIMIT_RETRIES,
  GITHUB_MAX_RATE_LIMIT_WAIT_SECONDS,
  shouldRetryRateLimit,
} from "@/lib/github-limits"

test("retries a short wait under the retry cap", () => {
  assert.equal(shouldRetryRateLimit(1, 0), true)
  assert.equal(shouldRetryRateLimit(GITHUB_MAX_RATE_LIMIT_WAIT_SECONDS, GITHUB_MAX_RATE_LIMIT_RETRIES - 1), true)
})

test("gives up at the retry cap or past the max wait", () => {
  assert.equal(shouldRetryRateLimit(1, GITHUB_MAX_RATE_LIMIT_RETRIES), false)
  assert.equal(shouldRetryRateLimit(GITHUB_MAX_RATE_LIMIT_WAIT_SECONDS + 1, 0), false)
})

test("429 is rate_limited with retry-after", () => {
  const error = { status: 429, response: { headers: { "retry-after": "30" } } }
  assert.deepEqual(classifyGitHubError(error), { code: "rate_limited", retryAfterSeconds: 30 })
})

test("403 with remaining 0 is rate_limited until the reset", () => {
  const now = 1_000_000_000_000
  const reset = String(now / 1000 + 120)
  const error = {
    status: 403,
    response: { headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": reset } },
  }
  assert.deepEqual(classifyGitHubError(error, now), { code: "rate_limited", retryAfterSeconds: 120 })
})

test("rate limit without timing headers falls back", () => {
  assert.deepEqual(classifyGitHubError({ status: 429 }), {
    code: "rate_limited",
    retryAfterSeconds: GITHUB_FALLBACK_RETRY_AFTER_SECONDS,
  })
})

test("plain 403 stays forbidden, other statuses keep their codes", () => {
  const error = { status: 403, response: { headers: { "x-ratelimit-remaining": "4999" } } }
  assert.deepEqual(classifyGitHubError(error), { code: "forbidden" })
  assert.deepEqual(classifyGitHubError({ status: 404 }), { code: "not_found" })
  assert.deepEqual(classifyGitHubError({ status: 502 }), { code: "upstream_github" })
  assert.deepEqual(classifyGitHubError(new Error("network")), { code: "upstream_github" })
})
