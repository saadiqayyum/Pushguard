// Where "install" points. Null when the operator has not set the app slug, so
// callers can say so plainly instead of rendering a dead button.
//
// One link that installs the app and signs the visitor in. Three things on the
// GitHub App make it one screen rather than two:
//
//   1. "Request user authorization (OAuth) during installation" is on, so the
//      install screen collects the sign-in consent as well.
//   2. /api/install/complete is the FIRST user authorization callback URL, //      GitHub redirects there after an install, and Auth.js passes its own
//      redirect_uri so it still gets /api/auth/callback/github for normal
//      sign-ins. Both must be registered.
//   3. AUTH_GITHUB_ID/SECRET are the GitHub App's own client credentials. A
//      separate OAuth App is a second app to authorise, and a second screen.
export function installUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG
  if (!raw) return null
  const slug = raw.split("/").filter(Boolean).pop()
  return slug ? `https://github.com/apps/${slug}/installations/new` : null
}
