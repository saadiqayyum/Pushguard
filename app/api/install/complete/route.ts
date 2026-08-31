import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { auth, signIn } from "@/lib/auth"
import { logger } from "@/lib/logger"
import { INTENT_COOKIE, parseIntentParam } from "@/lib/scan-intent"

// The GitHub App's **user authorization callback URL**. Not its Setup URL.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const setupAction = params.get("setup_action")
  logger.info("install_callback", {
    installationId: params.get("installation_id"),
    setupAction,
  })

  if (setupAction === "request") redirect("/install/pending")

  const jar = await cookies()
  const stored = jar.get(INTENT_COOKIE)?.value
  const intent = stored ? parseIntentParam(stored.replace(/^\/scan\//, "")) : null
  if (stored) jar.delete(INTENT_COOKIE)
  const destination = intent?.path ?? "/dashboard"

  if ((await auth())?.user) redirect(destination)
  await signIn("github", { redirectTo: destination })
}
