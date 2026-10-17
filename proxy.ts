import { NextRequest, NextResponse } from "next/server"
import { handlers, SESSION_COOKIES } from "@/lib/auth"
import { botAllowed } from "@/lib/bots"

// Only Auth.js's own endpoint can rewrite the session cookie. Asking it here and
// copying the result onto the request means a rotated (single-use) refresh token
// is persisted once, and the handler below reads the fresh token, not the old one.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (!botAllowed(request.headers.get("user-agent") ?? "", pathname)) return new NextResponse(null, { status: 403 })
  if (pathname === INSTALL_CALLBACK) return fromInstallScreen(request)
  if (!SESSION_PATHS.test(pathname)) return NextResponse.next()
  const names = request.cookies.getAll().map((c) => c.name)
  if (!names.some((name) => SESSION_COOKIES.some((base) => name.startsWith(base)))) return NextResponse.next()

  const session = await handlers.GET(
    new NextRequest(new URL("/api/auth/session", request.url), { headers: request.headers }),
  )
  const updated = new NextResponse(null, { headers: session.headers }).cookies.getAll()
  for (const cookie of updated) {
    if (cookie.maxAge === 0) request.cookies.delete(cookie.name)
    else request.cookies.set(cookie.name, cookie.value)
  }

  const response = NextResponse.next({ request: { headers: request.headers } })
  for (const cookie of updated) response.cookies.set(cookie)
  return response
}

const INSTALL_CALLBACK = "/api/auth/callback/github"

// GitHub's install screen sends the user to the App's callback URL with
// `setup_action`, but Auth.js never started that flow, so it has no PKCE cookie
// to check and fails. Those land on install/complete, which signs in properly.
function fromInstallScreen(request: NextRequest) {
  if (!request.nextUrl.searchParams.has("setup_action")) return NextResponse.next()
  const target = new URL("/api/install/complete", request.url)
  for (const key of ["installation_id", "setup_action"]) {
    const value = request.nextUrl.searchParams.get(key)
    if (value) target.searchParams.set(key, value)
  }
  return NextResponse.redirect(target)
}

const SESSION_PATHS = /^\/(dashboard|admin|scan)(\/|$)|^\/api\/(?!auth|webhook|jobs|health)/

// Every route runs the bot check, so robots.txt is enforced; static files skip the proxy.
export const config = {
  matcher: ["/((?!_next/static|_next/image|icon|opengraph-image|robots.txt|sitemap.xml).*)"],
}
