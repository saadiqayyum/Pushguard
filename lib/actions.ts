"use server"

import { cookies } from "next/headers"
import { signIn, signOut } from "@/lib/auth"
import { env } from "@/lib/env"
import { TERMS_COOKIE_TTL_SECONDS } from "@/lib/limits"
import { signinDestination } from "@/lib/signin"
import { signTermsCookie, TERMS_COOKIE, TERMS_VERSION } from "@/lib/terms"
import { signInForm } from "@/schemas/terms"

// Named, not inline.
export async function signOutAction() {
  await signOut({ redirectTo: "/" })
}

// The cookie carries the accepted version through GitHub's OAuth round trip;
// the jwt callback records it once the login is known.
export async function continueWithGitHub(formData: FormData) {
  const { next, switching } = signInForm.parse({
    next: formData.get("next") || null,
    switching: formData.get("switch") === "1",
  })
  ;(await cookies()).set(TERMS_COOKIE, signTermsCookie(TERMS_VERSION, env().AUTH_SECRET, Date.now()), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: TERMS_COOKIE_TTL_SECONDS,
  })
  if (switching) await signOut({ redirect: false })
  await signIn("github", { redirectTo: signinDestination(next) }, switching ? { prompt: "select_account" } : undefined)
}
