import { hit } from "@/lib/db/rate-limits"
import { AppError } from "@/lib/errors"
import { RUNNER_RATE_WINDOW_SECONDS, RUNNER_REQUESTS_PER_WINDOW } from "@/lib/runner/limits"

// Runner endpoints are unauthenticated until a token matches, so they are
// throttled per address before any lookup to keep guessing expensive.
export async function limitRunner(request: Request): Promise<void> {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const { count, resetIn } = await hit(`runner:${ip}`, RUNNER_RATE_WINDOW_SECONDS)
  if (count > RUNNER_REQUESTS_PER_WINDOW) throw new AppError("rate_limited", "Too many runner requests", { retryAfterSeconds: resetIn })
}

export async function readBody(request: Request, maxBytes: number): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) throw new AppError("payload_too_large", "Body too large")
  const raw = await request.text()
  if (raw.length > maxBytes) throw new AppError("payload_too_large", "Body too large")
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new AppError("validation_failed", "Body is not JSON", { cause: error })
  }
}
