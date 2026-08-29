// One place to decide how much any endpoint or page will ever return. Every
// list in the app is user- or GitHub-driven and therefore unbounded without it.

export const DEFAULT_PER_PAGE = 25
export const MAX_PER_PAGE = 100

// GitHub's search API refuses to page past 1000 results, so asking for more is
// an error rather than an empty page.
export const GITHUB_SEARCH_MAX_RESULTS = 1000

export type Paging = { page: number; perPage: number; skip: number }

function toInt(value: string | null | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

export function parsePaging(
  params: URLSearchParams | { page?: string; perPage?: string },
  defaultPerPage = DEFAULT_PER_PAGE,
): Paging {
  const get = (key: "page" | "perPage") =>
    params instanceof URLSearchParams ? params.get(key) : params[key]

  const page = toInt(get("page"), 1)
  const perPage = Math.min(toInt(get("perPage"), defaultPerPage), MAX_PER_PAGE)
  return { page, perPage, skip: (page - 1) * perPage }
}
