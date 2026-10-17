export const CONTRIBUTOR_TEXT_MAX = 50_000
export const CONTRIBUTOR_TITLE_MAX = 200
export const CONTRIBUTOR_URLS_MAX = 20
export const CONTRIBUTOR_URL_MAX = 2048
export const CONTRIBUTOR_REASONING_MAX = 8_000
export const CONTRIBUTOR_SOURCES = ["advisory", "incident", "doc"] as const

// Platform spend, not an org's: one pseudo-org row in ai_usage, which no GitHub
// login can collide with because logins never contain "@".
export const PLATFORM_USAGE_KEY = "@platform"
export const PLATFORM_DAILY_TOKEN_BUDGET = 2_000_000
export const CONTRIBUTOR_RUN_TOKEN_BUDGET = 150_000
export const CONTRIBUTOR_MAX_OUTPUT_TOKENS = 24_000
export const CONTRIBUTOR_TIMEOUT_MS = 120_000
// Used only with the anthropic provider; any other provider needs PLATFORM_AI_MODEL.
export const DEFAULT_PLATFORM_MODEL = "claude-opus-5-5"
