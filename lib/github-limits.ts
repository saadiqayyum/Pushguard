import type { ErrorCode } from "@/lib/errors"

export const GITHUB_MAX_RATE_LIMIT_RETRIES = 2

// A serverless function bills and times out while it sleeps. Past this, the
// rate limit surfaces as an error so a queue can requeue with a visibility timeout.
export const GITHUB_MAX_RATE_LIMIT_WAIT_SECONDS = 10

// Used when GitHub sends neither retry-after nor x-ratelimit-reset.
export const GITHUB_FALLBACK_RETRY_AFTER_SECONDS = 60

export const GITHUB_MAX_RETRIES = 2

// Members stored per organization. Past this, someone left out reads nothing
// through membership until they sign in, which re-reads their own role.
export const MAX_ORG_MEMBERS = 10_000

// The retry plugin's defaults plus 429, which the throttling plugin owns.
export const GITHUB_DO_NOT_RETRY = [400, 401, 403, 404, 410, 422, 429, 451]

export function shouldRetryRateLimit(retryAfter: number, retryCount: number): boolean {
  return retryCount < GITHUB_MAX_RATE_LIMIT_RETRIES && retryAfter <= GITHUB_MAX_RATE_LIMIT_WAIT_SECONDS
}

type GitHubFailure = {
  status?: number
  response?: { headers?: Record<string, string | number | undefined> }
}

export function classifyGitHubError(
  error: unknown,
  now = Date.now(),
): { code: ErrorCode; retryAfterSeconds?: number } {
  const { status, response } = (error ?? {}) as GitHubFailure
  const headers = response?.headers ?? {}
  const retryAfter = Number(headers["retry-after"])
  const exhausted = String(headers["x-ratelimit-remaining"]) === "0"
  if (status === 429 || (status === 403 && (exhausted || retryAfter > 0))) {
    const reset = Math.ceil(Number(headers["x-ratelimit-reset"]) - now / 1000)
    const seconds = retryAfter > 0 ? retryAfter : reset > 0 ? reset : GITHUB_FALLBACK_RETRY_AFTER_SECONDS
    return { code: "rate_limited", retryAfterSeconds: seconds }
  }
  if (status === 404) return { code: "not_found" }
  if (status === 401 || status === 403) return { code: "forbidden" }
  return { code: "upstream_github" }
}

// Delivery log pages read per reconcile, newest first, 100 per page.
export const MAX_DELIVERY_PAGES = 5

// Installations checked at sign-in, and repositories read when registering one
// whose webhook never arrived.
export const MAX_USER_INSTALLATIONS = 20
export const MAX_REGISTERED_REPOS = 1_000
