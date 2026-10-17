import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    login: string
    signedInAt: number
    error?: "RefreshTokenError"
  }
}

// Tokens live in the encrypted JWT only. Session is what /api/auth/session
// hands the browser, so nothing secret is copied onto it.
declare module "next-auth/jwt" {
  interface JWT {
    login?: string
    githubToken?: string
    refreshToken?: string
    expiresAt?: number
    signedInAt?: number
    error?: "RefreshTokenError"
  }
}
