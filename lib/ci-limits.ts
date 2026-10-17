// Caps for the tag-repointing defenses: action pins, tag snapshots, tag
// posture, workflow log scanning and the member-to-tag chain.

// Pinned actions checked per push or pull request; the rest are reported unchecked.
export const MAX_PINS_CHECKED_PER_CHANGE = 20

// Pages of an action's tags searched for one pointing at a pinned commit.
export const MAX_ACTION_TAG_PAGES = 3
export const TAGS_PER_PAGE = 100

// GitHub-owned actions are not third-party for the log-scan gate.
export const FIRST_PARTY_ACTION_OWNERS = ["actions", "github"]

// Tags kept per repository snapshot. Past it the rest are reported unwatched.
export const MAX_TAGS_SNAPSHOT = 1_000

// The first webhook for a repository in each window refreshes its tag snapshot.
export const TAG_SNAPSHOT_DEBOUNCE_SECONDS = 600

// Distinct new targets checked for reachability in one snapshot.
export const MAX_MOVED_GROUPS_CHECKED = 10

// Tags named in one grouped tag-moved finding; the rest are counted.
export const MAX_TAGS_NAMED = 10

// Rulesets read when deciding whether a repository's tags are protected.
export const MAX_RULESETS_READ = 20

// A run's log archive, compressed and inflated, and the files read from it.
export const MAX_LOG_ZIP_BYTES = 20_000_000
export const MAX_LOG_UNZIPPED_BYTES = 50_000_000
export const MAX_LOG_ENTRIES = 500

// Base64 runs this long are decoded; this long are a dump on their own.
export const BASE64_DECODE_MIN_CHARS = 40
export const LONG_BASE64_RUN_CHARS = 2_000
export const MAX_BASE64_DECODE_CHARS = 262_144
export const MAX_LOG_HITS = 10

// A run whose logs the App may not read is logged once per org per window.
export const LOGS_FORBIDDEN_LOG_WINDOW_SECONDS = 86_400

// tj-actions: a member added, a branch pushed and deleted within seconds, a
// tag moved within hours. These bound each step and what is read to join them.
export const BRANCH_FLASH_SECONDS = 60
export const CHAIN_WINDOW_SECONDS = 24 * 60 * 60
export const MAX_CHAIN_EVENTS_READ = 200

// How long a pin's reachability is trusted. A reachable commit stays reachable
// unless its branch is rewritten; an unreachable one may be pushed upstream soon.
export const PIN_REACHABLE_TTL_HOURS = 168
export const PIN_UNREACHABLE_TTL_HOURS = 1
