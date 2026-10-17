import { ADMIN_HOME } from "@/lib/platform/limits"
import { parseIntentParam } from "@/lib/scan-intent"

export const INSTALL_START = "/api/install/start"

const APP_PATH = /^\/(dashboard|admin)(\/[\w\-.]*)*(\?[\w\-.=&%]*)?$/

// Same-origin paths into the app only, so `next` cannot become an open redirect.
export function signinDestination(next: string | null): string {
  if (next === ADMIN_HOME || next === INSTALL_START) return next
  if (next && APP_PATH.test(next) && !next.includes("..")) return next
  return parseIntentParam(next?.replace(/^\/scan\//, "") ?? null)?.path ?? "/dashboard"
}
