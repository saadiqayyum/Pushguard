import "next-auth"

declare module "next-auth" {
  interface Session {
    login: string
    orgs: string[]
  }
}
