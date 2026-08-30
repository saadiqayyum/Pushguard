import "next-auth"

declare module "next-auth" {
  interface Session {
    login: string
    orgs: string[]
    // No GitHub token here on purpose. Session is what /api/auth/session hands
    // the browser; the token lives in the JWT and is read with githubToken().
  }
}
