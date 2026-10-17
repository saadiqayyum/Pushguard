import { currentUser } from "@/lib/auth"
import { hit, withUser } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { SESSION_CHECKS_PER_WINDOW, USER_RATE_WINDOW_SECONDS } from "@/lib/limits"
import { respond, withErrorHandler } from "@/lib/route"
import { sessionOut } from "@/schemas/terms"

export const dynamic = "force-dynamic"

// Lets static pages decide between the dashboard and the sign-in dialog.
export const GET = withErrorHandler("/api/session", async (request) => {
  const user = await currentUser()
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const key = user ? `session:${user.login.toLowerCase()}` : `session-ip:${ip}`
  const { count, resetIn } = await withUser(user?.login ?? "", () => hit(key, USER_RATE_WINDOW_SECONDS))
  if (count > SESSION_CHECKS_PER_WINDOW) throw new AppError("rate_limited", "Too many requests", { retryAfterSeconds: resetIn })
  return respond(sessionOut, user ? { signedIn: true, login: user.login } : { signedIn: false }, {
    headers: { "Cache-Control": "no-store" },
  })
})
