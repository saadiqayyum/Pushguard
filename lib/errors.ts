export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "invalid_signature"
  | "validation_failed"
  | "not_found"
  | "payload_too_large"
  | "rate_limited"
  | "upstream_github"
  | "upstream_ai"
  | "internal"

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  invalid_signature: 401,
  validation_failed: 422,
  not_found: 404,
  payload_too_large: 413,
  rate_limited: 429,
  upstream_github: 502,
  upstream_ai: 502,
  internal: 500,
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number

  constructor(code: ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.code = code
    this.status = STATUS[code]
  }
}
