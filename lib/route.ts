import { NextResponse } from "next/server"
import { ZodError } from "zod"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"

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
        cause: appError.cause instanceof Error ? appError.cause.message : undefined,
        ms: Date.now() - start,
      })
      return NextResponse.json(
        { error: { code: appError.code, message: clientMessage(appError) } },
        { status: appError.status },
      )
    }
  }
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
