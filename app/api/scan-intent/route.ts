import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { auth, signIn } from "@/lib/auth"
import { installUrl } from "@/lib/install-url"
import { INTENT_COOKIE, parseIntentParam } from "@/lib/scan-intent"

/**
 * Holds on to "I want to scan acme/api" across a trip to GitHub.
 *
 * A server component cannot call `signIn` or set a cookie, so the deep-link page
 * sends people here instead. Two jobs, one handler:
 *
 *   ?target=acme/api            sign in, then come back to /scan/acme/api
 *   ?target=acme/api&install=1  install first, then come back
 *
 * The cookie is what survives the install round trip: GitHub's post-install
 * redirect carries an installation id and nothing of ours, so /api/install/complete
 * reads it on the way back.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const intent = parseIntentParam(params.get("target"))
  // Only ever a path this app built from two validated segments, never a value
  // off the query string, which is how this would become an open redirect.
  const destination = intent?.path ?? "/dashboard/scans"

  if (params.get("install") === "1") {
    const install = installUrl()
    if (!install) redirect("/dashboard/scans")
    if (intent) {
      ;(await cookies()).set(INTENT_COOKIE, intent.path, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 600,
      })
    }
    redirect(install)
  }

  if ((await auth())?.user) redirect(destination)
  await signIn("github", { redirectTo: destination })
}
