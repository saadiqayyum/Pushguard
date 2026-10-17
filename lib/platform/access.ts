import { ADMIN_SESSION_MAX_AGE_SECONDS } from "./limits"

export type AdminSession = { login: string; signedInAt: number } | null
export type PlatformAccess = "ok" | "not_found" | "reauth"

// Anyone outside the list, signed in or not, sees the same 404 as a missing page.
export function platformAccess(session: AdminSession, admins: readonly string[], nowSeconds: number): PlatformAccess {
  if (!session?.login || !admins.includes(session.login.toLowerCase())) return "not_found"
  return nowSeconds - session.signedInAt > ADMIN_SESSION_MAX_AGE_SECONDS ? "reauth" : "ok"
}
