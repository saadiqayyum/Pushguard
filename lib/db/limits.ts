// Comment bodies are mirrored for reading, not stored in full.
export const MAX_COMMENT_CHARS = 4_000;
export const MAX_COMMENTS = 50;

// Recurrences of an alert. Twenty is a pattern; the rest is a tally.
export const MAX_SIGHTINGS = 20;

// Anything done to an issue. An issue labelled twenty times is not twenty facts.
export const MAX_ACTIVITY = 50;

// A repository with thousands of branches is not something a dropdown can
// serve, and storing them all bloats the document for no gain.
export const MAX_STORED_BRANCHES = 300;

// Findings kept on one scan.
export const MAX_SCAN_FINDINGS = 500;

// Background work claimed but never reported back. The invocation that owned it
// was cut off, so it goes back in the queue rather than staying claimed forever.
export const STUCK_AFTER_MS = 5 * 60 * 1000;

// Open pull requests seeded per repository. Past this the tab shows the newest
// and the webhook keeps it current from there.
export const MAX_OPEN_PULL_REQUESTS_PER_REPO = 100;

// Connections per serverless instance. Supavisor multiplexes them; more per
// instance only exhausts the pooler sooner.
export const DB_POOL_MAX = 3;

// A cached OSV hit is trusted this long before OSV is asked again, so a
// withdrawn entry stops flagging. GHSA and seeded entries are kept current by events.
export const MALICIOUS_CACHE_TTL_HOURS = 24;

// Advisory summaries are titles. GHSA caps them at 1024; we show a line.
export const MAX_ADVISORY_SUMMARY = 300;

// Inventory rows read for one batch of newly malicious packages.
export const MAX_DEPENDENTS_READ = 5_000;

// Indicators matched against one push. Loaded once per job.
export const MAX_INDICATORS_LOADED = 5_000;

// Packages kept from one lockfile, and the bytes read to find them. A lockfile
// past either is logged as partly inventoried.
export const MAX_MANIFEST_ENTRIES = 5_000;
export const MAX_LOCKFILE_BYTES = 10_000_000;

// Lockfiles read in one index run.
export const MAX_MANIFESTS_PER_RUN = 50;

// Advisory rows read for one batch of package names.
export const MAX_MALICIOUS_ROWS_READ = 5_000;

// ponytail: repositories alerted per batch of newly malicious packages, so the job
// fits its budget; the rest are only logged. Continue in a follow-up job if hit.
export const MAX_DEPENDENT_ALERTS = 100;


// Merged pull request commits are kept this long for the reviewed check; a push
// arrives seconds after its merge, so a month is generous.
export const MERGED_COMMIT_RETENTION_DAYS = 30
export const MAX_MERGED_COMMIT_PRUNE = 500

// Paths kept on one coalesced AI review range; past it the review says so.
export const MAX_PENDING_REVIEW_PATHS = 3_000
export const MAX_PENDING_REVIEW_MESSAGES = 100

// The Overview page: days in the alert trend and alerts in its latest list.
export const OVERVIEW_TREND_DAYS = 7
export const OVERVIEW_LATEST_ALERTS = 5
