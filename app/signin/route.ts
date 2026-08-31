import { redirect } from "next/navigation"
import { auth, signIn } from "@/lib/auth"
import { parseIntentParam } from "@/lib/scan-intent"

// Sign in. There is no login page.
export async function GET(request: Request) {
  const next = new URL(request.url).searchParams.get("next")
  const destination = parseIntentParam(next?.replace(/^\/scan\//, "") ?? null)?.path ?? "/dashboard"

  if ((await auth())?.user) redirect(destination)
  await signIn("github", { redirectTo: destination })
}
