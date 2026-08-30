import NextAuth from "next-auth"
import { getToken } from "next-auth/jwt"
import GitHub from "next-auth/providers/github"
import { cookies, headers } from "next/headers"
import { AppError } from "@/lib/errors"
import { fetchUserOrgs } from "@/lib/github"
import { logger } from "@/lib/logger"

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  pages: { signIn: "/signin" },
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      authorization: { params: { scope: "read:user read:org" } },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.access_token && profile) {
        token.login = (profile.login as string) ?? token.name
        // Kept, not discarded: a scan is authorised by asking GitHub which
        // repositories *this user* can reach, which needs their own token.
        // Requires "Expire user authorization tokens" to be off on the App, // with it on this goes stale after 8 hours and scans start 401ing.
        token.githubToken = account.access_token
        try {
          token.orgs = await fetchUserOrgs(account.access_token)
        } catch (error) {
          logger.warn("org_fetch_failed_at_login", {
            login: token.login,
            error: error instanceof Error ? error.message : String(error),
          })
          token.orgs = []
        }
      }
      return token
    },
    session({ session, token }) {
      session.login = (token.login as string) ?? ""
      session.orgs = (token.orgs as string[]) ?? []
      // The GitHub token is deliberately NOT copied here. Whatever `session()`
      // returns is what `/api/auth/session` serves to the browser, so putting a
      // credential on it hands any script on the page. An XSS, an extension, // something the httpOnly cookie exists to keep away from them. It stays in
      // the JWT and is read server-side by githubToken() below.
      return session
    },
  },
})

export type Member = { login: string; orgs: string[] }

// A user's personal account counts as an installable "org": solo accounts
// install the app on themselves.
export function memberScopes(member: { login: string; orgs: string[] }): string[] {
  return [member.login, ...member.orgs].filter(Boolean)
}

export async function requireUser(): Promise<Member> {
  const session = await auth()
  if (!session?.user) throw new AppError("unauthorized", "Sign in required")
  return { login: session.login || (session.user.name ?? "unknown"), orgs: session.orgs ?? [] }
}

export async function requireMember(org: string): Promise<Member> {
  const member = await requireUser()
  if (!memberScopes(member).includes(org)) throw new AppError("forbidden", `Not a member of ${org}`)
  return member
}

// Session-token cookie names, secure-prefixed on https and bare on http.
const SESSION_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"]

/**
 * The signed-in user's GitHub token, readable only on the server.
 *
 * Decodes the httpOnly session JWT directly rather than going through
 * `auth()`: the Session object is serialised to the browser, and this must not
 * be. Returns null when the session predates the token being stored, or when it
 * has been revoked, callers ask the user to sign in again.
 */
export async function githubToken(): Promise<string | null> {
  const jar = await cookies()
  const cookieName = SESSION_COOKIES.find((name) => jar.get(name))
  if (!cookieName) return null

  // getToken reads the cookie off the headers; `next/headers` already carries it.
  const decoded = await getToken({
    req: { headers: new Headers(await headers()) },
    secret: process.env.AUTH_SECRET!,
    cookieName,
    secureCookie: cookieName.startsWith("__Secure-"),
  })
  return typeof decoded?.githubToken === "string" ? decoded.githubToken : null
}
