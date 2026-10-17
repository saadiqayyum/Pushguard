// Inbound requests per signed-in login, fixed window, counted in Postgres.
export const USER_REQUESTS_PER_WINDOW = 120
export const USER_RATE_WINDOW_SECONDS = 60

// Refresh the 8h GitHub user token this long before it expires, so a request
// never starts with a token that dies mid-flight.
export const TOKEN_REFRESH_MARGIN_SECONDS = 300

export const TERMS_COOKIE_TTL_SECONDS = 600

// Public pages ask once per load and on focus; signed-out callers are counted per address.
export const SESSION_CHECKS_PER_WINDOW = 60


