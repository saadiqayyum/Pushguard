// Where "install" points. Null when the operator has not set the app slug, so
// callers can say so plainly instead of rendering a dead button.
export function installUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG
  if (!raw) return null
  const slug = raw.split("/").filter(Boolean).pop()
  return slug ? `https://github.com/apps/${slug}/installations/new` : null
}
