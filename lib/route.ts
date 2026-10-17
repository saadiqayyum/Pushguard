import { NextResponse } from "next/server"
import { ZodError, type ZodType } from "zod"
import { requireUser, type User } from "@/lib/auth"
import { hit, withUser } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { USER_RATE_WINDOW_SECONDS, USER_REQUESTS_PER_WINDOW } from "@/lib/limits"
import { logger } from "@/lib/logger"
import { requireTerms } from "@/lib/terms"

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>

export function withErrorHandler(route: string, handler: Handler): Handler {
  return async (request, context) => {
    const requestId = crypto.randomUUID()
    const start = Date.now()
    try {
      return await handler(request, context)
    } catch (error) {
      const appError = toAppError(error)
      logger.error("request_failed", {
        route,
        requestId,
        code: appError.code,
        error: appError.message,
        cause: rootCause(appError.cause),
        ms: Date.now() - start,
      })
      const retryAfter =
        appError.code === "rate_limited" && appError.retryAfterSeconds
          ? { "Retry-After": String(Math.ceil(appError.retryAfterSeconds)) }
          : undefined
      return NextResponse.json(
        { error: { code: appError.code, message: clientMessage(appError) } },
        { status: appError.status, headers: retryAfter },
      )
    }
  }
}

// Drizzle wraps the Postgres error in its own, so the useful message is the innermost one.
function rootCause(error: unknown): string | undefined {
  let current = error
  while (current instanceof Error && current.cause instanceof Error) current = current.cause
  return current instanceof Error ? current.message : undefined
}

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error
  if (error instanceof ZodError) {
    const detail = error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    return new AppError("validation_failed", detail, { cause: error })
  }
  return new AppError("internal", error instanceof Error ? error.message : "Unknown error", { cause: error })
}

function clientMessage(error: AppError): string {
  return error.code === "internal" ? "Internal error" : error.message
}

type UserHandler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
  user: User,
) => Promise<Response>

// Every user route: signed in, counted against the login's window, terms
// accepted, and run inside withUser so row-level security sees who is asking.
export function userRoute(route: string, handler: UserHandler, options?: { termsExempt: true }): Handler {
  return withErrorHandler(route, async (request, context) => {
    const user = await requireUser()
    return withUser(user.login, async () => {
      const { count, resetIn } = await hit(`user:${user.login.toLowerCase()}`, USER_RATE_WINDOW_SECONDS)
      if (count > USER_REQUESTS_PER_WINDOW) {
        throw new AppError("rate_limited", "Too many requests", { retryAfterSeconds: resetIn })
      }
      if (!options?.termsExempt) await requireTerms(user.login)
      return handler(request, context, user)
    })
  })
}

// The only way a route answers with data: through an explicit output schema,
// which strips any column the schema does not name.
export function respond<T>(schema: ZodType<T>, data: unknown, init?: ResponseInit): Response {
  const parsed = schema.safeParse(data)
  if (!parsed.success) throw new AppError("internal", "Response failed its schema", { cause: parsed.error })
  return NextResponse.json({ data: parsed.data }, init)
}
