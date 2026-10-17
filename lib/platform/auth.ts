import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { hit, withUser } from "@/lib/db"
import { env } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { withErrorHandler } from "@/lib/route"
import { requireTerms } from "@/lib/terms"
import { platformAccess, type PlatformAccess } from "./access"
import { ADMIN_RATE_WINDOW_SECONDS, ADMIN_REQUESTS_PER_WINDOW } from "./limits"

export type PlatformAdmin = { login: string }
async function check(): Promise<{ access: PlatformAccess; login: string }> {
  const session = await auth()
  const current = session?.login ? { login: session.login, signedInAt: session.error ? 0 : session.signedInAt } : null
  return { access: platformAccess(current, env().PLATFORM_ADMINS, Date.now() / 1000), login: current?.login.toLowerCase() ?? "" }
}

// The /admin layout: a stale staff session renders the sign-in dialog in place.
export async function platformAdminPage(): Promise<PlatformAdmin & { reauth: boolean }> {
  const { access, login } = await check()
  if (access === "not_found") notFound()
  return { login, reauth: access === "reauth" }
}

// Pages under /admin. The layout has already asked a stale session to sign in again.
export async function requirePlatformAdmin(): Promise<PlatformAdmin> {
  const { login, reauth } = await platformAdminPage()
  if (reauth) throw new AppError("unauthorized", "Sign in again to use the console")
  return { login }
}

type AdminHandler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
  admin: PlatformAdmin,
) => Promise<Response>

// Every /api/admin route. The handler itself takes the system handle.
export function adminRoute(route: string, handler: AdminHandler) {
  return withErrorHandler(route, async (request, context) => {
    const { access, login } = await check()
    if (access === "not_found") throw new AppError("not_found", "Not found")
    if (access === "reauth") throw new AppError("unauthorized", "Sign in again to use the console")
    const { count, resetIn } = await withUser(login, () => hit(`admin:${login}`, ADMIN_RATE_WINDOW_SECONDS))
    if (count > ADMIN_REQUESTS_PER_WINDOW) {
      throw new AppError("rate_limited", "Too many requests", { retryAfterSeconds: resetIn })
    }
    await withUser(login, () => requireTerms(login))
    return handler(request, context, { login })
  })
}
