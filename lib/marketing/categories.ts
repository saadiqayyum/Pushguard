// Folder names under docs/attacks, in the order docs/attacks/README.md lists them.
export const CATEGORIES = [
  { id: "packages", title: "Package and maintainer takeover" },
  { id: "multi-stage", title: "Multi-stage backdoors" },
  { id: "ci-cd", title: "CI/CD and GitHub platform" },
  { id: "hidden-code", title: "Hidden code and developer environment" },
  { id: "ai", title: "AI-era attacks" },
] as const

export type CategoryId = (typeof CATEGORIES)[number]["id"]

export const categoryTitle = (id: string) => CATEGORIES.find((c) => c.id === id)?.title ?? id
