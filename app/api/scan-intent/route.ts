import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { auth, signIn } from "@/lib/auth"
import { installUrl } from "@/lib/install-url"
import { INTENT_COOKIE, parseIntentParam } from "@/lib/scan-intent"

// Holds on to "I want to scan acme/api" across a trip to GitHub.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const intent = parseIntentParam(params.get("target"))
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
