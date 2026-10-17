import { unauthorized } from "next/navigation"
import NextAuth from "next-auth"
import type { JWT } from "next-auth/jwt"
import { getToken } from "next-auth/jwt"
import GitHub from "next-auth/providers/github"
import { cookies, headers } from "next/headers"
import { z } from "zod"
import { activeInstallations, asSystem, installationById, recordTermsAcceptance, upsertOrgMember } from "@/lib/db"
import { env } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { fetchUserInstallations, fetchUserMemberships, refreshUserToken } from "@/lib/github"
import { registerMissedInstallation } from "@/lib/jobs/register-installation"
import { TOKEN_REFRESH_MARGIN_SECONDS } from "@/lib/limits"
import { logger } from "@/lib/logger"
import { TERMS_COOKIE, TERMS_VERSION, verifyTermsCookie } from "@/lib/terms"

const refreshedToken = z.object({
  access_token: z.string().min(1).max(512),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().min(1).max(512).optional(),
})

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

// Roles change on GitHub without a webhook for promotion or demotion, so the one
// read of the user's own memberships happens here, never on a timer.
// An install whose webhook never arrived would otherwise send the user back to
// GitHub's configure page, which does not redirect here. Registered inline so
// the dashboard is right on the first load; repo sync still goes through jobs.
async function registerMissedInstallations(login: string, userToken: string): Promise<void> {
  const found = await fetchUserInstallations(userToken).catch((error) => {
    logger.warn("installation_discovery_failed", { login, error: errorMessage(error) })
    return []
  })
  await asSystem(async () => {
    for (const install of found) {
      if (await installationById(install.id)) continue
      await registerMissedInstallation({ type: "register_installation", installationId: install.id, installedBy: login }).catch(
        (error) => logger.warn("installation_register_failed", { login, installationId: install.id, error: errorMessage(error) }),
      )
    }
  })
}

async function recordMemberships(login: string, userToken: string): Promise<void> {
  const memberships = await fetchUserMemberships(userToken).catch((error) => {
    logger.warn("membership_fetch_failed", { login, error: errorMessage(error) })
    return []
  })
  await asSystem(async () => {
    await upsertOrgMember(login, login, "admin")
    const installed = new Set(
      (await activeInstallations(memberships.map((m) => m.org))).map((i) => i.org),
    )
    for (const { org, role } of memberships) {
      if (installed.has(org)) await upsertOrgMember(org, login, role)
    }
    logger.info("memberships_recorded", { login, orgs: installed.size })
  })
}

// Set by the sign-in page's checkbox. A missing, forged or stale cookie records
// nothing, and the dashboard asks again.
async function recordTermsFromCookie(login: string): Promise<void> {
  const jar = await cookies()
  const raw = jar.get(TERMS_COOKIE)?.value
  if (!raw) return
  jar.delete(TERMS_COOKIE)
  if (verifyTermsCookie(raw, env().AUTH_SECRET, Date.now()) !== TERMS_VERSION) {
    logger.warn("terms_cookie_rejected", { login })
    return
  }
  await asSystem(() => recordTermsAcceptance(login, TERMS_VERSION))
  logger.info("terms_accepted", { login, version: TERMS_VERSION, via: "signin" })
}

async function refresh(token: JWT): Promise<JWT> {
  if (typeof token.refreshToken !== "string") return { ...token, error: "RefreshTokenError" }
  try {
    const fresh = refreshedToken.parse(await refreshUserToken(token.refreshToken))
    return {
      ...token,
      githubToken: fresh.access_token,
      expiresAt: fresh.expires_in ? Math.floor(Date.now() / 1000) + fresh.expires_in : undefined,
      refreshToken: fresh.refresh_token ?? token.refreshToken,
      error: undefined,
    }
  } catch (error) {
    logger.warn("token_refresh_failed", { login: token.login, error: errorMessage(error) })
    return { ...token, error: "RefreshTokenError" }
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  pages: { signIn: "/", error: "/" },
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.access_token && profile) {
        const login = String(profile.login ?? token.name ?? "")
        await registerMissedInstallations(login, account.access_token)
        await recordMemberships(login, account.access_token)
        await recordTermsFromCookie(login).catch((error) => logger.warn("terms_record_failed", { login, error: errorMessage(error) }))
        return {
          ...token,
          login,
          githubToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
          signedInAt: Math.floor(Date.now() / 1000),
        }
      }
      const expiresAt = typeof token.expiresAt === "number" ? token.expiresAt : null
      if (expiresAt === null || token.error) return token
      if (Date.now() / 1000 < expiresAt - TOKEN_REFRESH_MARGIN_SECONDS) return token
      return refresh(token)
    },
    session({ session, token }) {
      session.login = typeof token.login === "string" ? token.login : ""
      session.signedInAt = typeof token.signedInAt === "number" ? token.signedInAt : 0
      if (token.error) session.error = "RefreshTokenError"
      return session
    },
  },
})

export type User = { login: string }

// A valid, unexpired session, or null.
export async function currentUser(): Promise<User | null> {
  const session = await auth()
  if (!session?.user || !session.login || session.error) return null
  return { login: session.login }
}

// Route variant: throws, and withErrorHandler turns it into a 401.
export async function requireUser(): Promise<User> {
  const user = await currentUser()
  if (!user) throw new AppError("unauthorized", "Sign in required")
  return user
}

// Page variant. The layout renders in parallel and shows the sign-in dialog, so the page
// only stops with a 401 and renders nothing (app/dashboard/unauthorized.tsx).
export async function pageMember(): Promise<User> {
  const user = await currentUser()
  if (!user) unauthorized()
  return user
}

export const SESSION_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"]

// The signed-in user's GitHub token, readable only on the server.
export async function githubToken(): Promise<string | null> {
  const jar = await cookies()
  const cookieName = SESSION_COOKIES.find((name) => jar.get(name) || jar.get(`${name}.0`))
  if (!cookieName) return null

  const decoded = await getToken({
    req: { headers: new Headers(await headers()) },
    secret: process.env.AUTH_SECRET!,
    cookieName,
    secureCookie: cookieName.startsWith("__Secure-"),
  })
  if (!decoded || decoded.error) return null
  return typeof decoded.githubToken === "string" ? decoded.githubToken : null
}
