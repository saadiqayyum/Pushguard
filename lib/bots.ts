// AI crawlers and agents. Matched as case-insensitive substrings of the User-Agent
// and listed by name in robots.txt, so both read the same list.
export const AI_BOTS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-Web",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "CCBot",
  "Google-Extended",
  "GoogleOther",
  "Applebot-Extended",
  "PerplexityBot",
  "Perplexity-User",
  "Bytespider",
  "Amazonbot",
  "meta-externalagent",
  "FacebookBot",
  "cohere-ai",
  "cohere-training-data-crawler",
  "Diffbot",
  "YouBot",
  "ImagesiftBot",
  "Omgilibot",
  "Timpibot",
  "AI2Bot",
  "Ai2Bot-Dolma",
  "DuckAssistBot",
  "MistralAI-User",
  "PetalBot",
  "Scrapy",
] as const

export const PUBLIC_PAGES = ["/", "/how-to-use", "/research", "/terms", "/privacy"] as const

const PUBLIC_ASSETS = ["/_next/static/", "/_next/image", "/icon", "/opengraph-image", "/robots.txt", "/sitemap.xml"]

// Callers that are bots by design and must never be refused: GitHub, pg_net, the
// runner, MCP clients, OAuth callbacks and uptime checks.
const MACHINE_PATHS = ["/api/webhook", "/api/jobs", "/api/runner", "/api/mcp", "/api/auth", "/api/health"]

const GENERIC_BOT = /bot|crawl|spider|slurp|scrapy/i

const AI_BOT = new RegExp(AI_BOTS.join("|"), "i")

const within = (pathname: string, root: string) =>
  pathname === root || (root !== "/" && pathname.startsWith(`${root}/`))

const isPublic = (pathname: string) =>
  PUBLIC_PAGES.some((page) => within(pathname, page)) || PUBLIC_ASSETS.some((prefix) => pathname.startsWith(prefix))

// Pure: which requests a crawler may make. Search engines and other bots read the
// public pages; AI agents read nothing but robots.txt; people are never refused here.
export function botAllowed(userAgent: string, pathname: string): boolean {
  if (MACHINE_PATHS.some((root) => within(pathname, root))) return true
  if (AI_BOT.test(userAgent)) return pathname === "/robots.txt"
  if (GENERIC_BOT.test(userAgent)) return isPublic(pathname)
  return true
}
