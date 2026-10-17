export const ADMIN_HOME = "/admin"

// A stolen long-lived session must not reach the console: staff sign in again
// after this, even though the dashboard session is still valid.
export const ADMIN_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60

export const ADMIN_REQUESTS_PER_WINDOW = 120
export const ADMIN_RATE_WINDOW_SECONDS = 60

// A staff rule runs in shadow this long before it may be published without an override.
export const SHADOW_MIN_MS = 3 * 24 * 60 * 60 * 1000
export const OVERRIDE_REASON_MIN = 10
export const OVERRIDE_REASON_MAX = 500

export const AUDIT_DETAILS_MAX_BYTES = 4_000
export const AUDIT_PAGE_SIZE = 50
export const ADMIN_LIST_PAGE_SIZE = 50
export const SHADOW_RECENT_HITS = 20
