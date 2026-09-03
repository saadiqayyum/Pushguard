import NextAuth from "next-auth"
import { getToken } from "next-auth/jwt"
import GitHub from "next-auth/providers/github"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
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

async function currentMember(): Promise<Member | null> {
  const session = await auth()
  if (!session?.user) return null
  return { login: session.login || session.user.name || "", orgs: session.orgs ?? [] }
}

// Route variant: throws, and withErrorHandler turns it into a 401.
export async function requireUser(): Promise<Member> {
  const member = await currentMember()
  if (!member) throw new AppError("unauthorized", "Sign in required")
  return member
}

// Page variant: sends the visitor to sign in.
export async function pageMember(): Promise<Member> {
  const member = await currentMember()
  if (!member) redirect("/signin")
  return member
}

// Session-token cookie names, secure-prefixed on https and bare on http.
const SESSION_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"]

// The signed-in user's GitHub token, readable only on the server.
export async function githubToken(): Promise<string | null> {
  const jar = await cookies()
  const cookieName = SESSION_COOKIES.find((name) => jar.get(name))
  if (!cookieName) return null

  const decoded = await getToken({
    req: { headers: new Headers(await headers()) },
    secret: process.env.AUTH_SECRET!,
    cookieName,
    secureCookie: cookieName.startsWith("__Secure-"),
  })
  return typeof decoded?.githubToken === "string" ? decoded.githubToken : null
}
