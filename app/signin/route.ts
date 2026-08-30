import { redirect } from "next/navigation"
import { auth, signIn } from "@/lib/auth"
import { parseIntentParam } from "@/lib/scan-intent"

/**
 * Sign in. There is no login page.
 *
 * A page with one button was a screen between the reader and GitHub that asked
 * nothing and told them nothing. This bounces straight to GitHub, so "Sign in"
 * in the bar is an ordinary link rather than a form wrapping an inline server
 * action.
 */
export async function GET(request: Request) {
  const next = new URL(request.url).searchParams.get("next")
  // Only a path this app produced, never a value off the query string: anything
  // else here would be an open redirect.
  const destination = parseIntentParam(next?.replace(/^\/scan\//, "") ?? null)?.path ?? "/dashboard"

  if ((await auth())?.user) redirect(destination)
  await signIn("github", { redirectTo: destination })
}
