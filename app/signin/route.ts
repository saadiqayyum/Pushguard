import { redirect } from "next/navigation"
import { auth, signIn } from "@/lib/auth"
import { parseIntentParam } from "@/lib/scan-intent"

// Sign in. There is no login page. `?switch=1` forces GitHub's account picker,
// which it otherwise skips silently for whoever is signed in to github.com.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const next = params.get("next")
  const destination = parseIntentParam(next?.replace(/^\/scan\//, "") ?? null)?.path ?? "/dashboard"
  const switching = params.has("switch")

  if (!switching && (await auth())?.user) redirect(destination)
  await signIn("github", { redirectTo: destination }, switching ? { prompt: "select_account" } : undefined)
}
