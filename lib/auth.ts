import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"
import { AppError } from "@/lib/errors"
import { fetchUserOrgs } from "@/lib/github"
import { logger } from "@/lib/logger"

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  pages: { signIn: "/login" },
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
