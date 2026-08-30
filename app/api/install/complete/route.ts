import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { auth, signIn } from "@/lib/auth"
import { logger } from "@/lib/logger"
import { INTENT_COOKIE, parseIntentParam } from "@/lib/scan-intent"

/**
 * The GitHub App's **user authorization callback URL**. Not its Setup URL.
 * GitHub disables the Setup URL field once "Request user authorization (OAuth)
 * during installation" is on, and sends the post-install redirect here instead,
 * carrying `code`, `installation_id` and `setup_action`.
 *
 * The `code` is deliberately ignored. Redeeming it by hand would mean owning a
 * token exchange, a refresh cycle and a session mint that Auth.js already owns,
 * and Auth.js will not accept a code it did not request. It validates `state`
 * against a cookie only its own flow sets. So this hands off to `signIn`, which
 * starts a flow Auth.js *did* request. GitHub sees the grant the user just made
 * on the install screen and bounces straight back without rendering anything, so
 * the visitor sees one GitHub screen and lands signed in.
 *
 * This only collapses into one screen when AUTH_GITHUB_ID/SECRET are the GitHub
 * App's own client credentials. Point them at a separate OAuth App and the user
 * authorises two different apps, and sees two screens.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const setupAction = params.get("setup_action")
  logger.info("install_callback", {
    installationId: params.get("installation_id"),
    setupAction,
  })

  // An org that requires owner approval returns `request` with no installation
  // behind it yet. Signing in would strand them on an empty dashboard, so say
  // what happened instead.
  if (setupAction === "request") redirect("/install/pending")

  // Someone who arrived from a /scan/owner/repo link gets put back on it. The
  // cookie is re-parsed rather than trusted: it is the only value here that
  // reaches a redirect, and a tampered one would be an open redirect.
  const jar = await cookies()
  const stored = jar.get(INTENT_COOKIE)?.value
  const intent = stored ? parseIntentParam(stored.replace(/^\/scan\//, "")) : null
  if (stored) jar.delete(INTENT_COOKIE)
  const destination = intent?.path ?? "/dashboard"

  if ((await auth())?.user) redirect(destination)
  await signIn("github", { redirectTo: destination })
}
