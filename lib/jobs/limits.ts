// Longer than the route's maxDuration, so a job still running is never handed
// to a second invocation. A job whose invocation died reappears after this.
export const JOB_VISIBILITY_SECONDS = 360

export const JOB_MAX_ATTEMPTS = 5

// Wall clock for one /api/jobs/run call, under its 300s maxDuration.
export const JOB_RUN_BUDGET_MS = 240_000

// No new job starts with less than this left: a scan or review slice needs it.
export const JOB_START_FLOOR_MS = 60_000

// Inbound calls to /api/jobs/run per minute. pg_net wakes it once per enqueue.
export const JOBS_RUN_PER_MINUTE = 120
export const JOBS_RUN_WINDOW_SECONDS = 60

// Pushes per installation per minute before a burst is itself reported.
export const WEBHOOK_PUSHES_PER_MINUTE = 60
export const WEBHOOK_PUSH_WINDOW_SECONDS = 60

// GitHub lists at most this many commits in a push payload; past it the file
// list comes from the compare API instead.
export const PUSH_PAYLOAD_COMMIT_CAP = 20

// Repositories one sync job covers, so an install of hundreds fits in budget.
export const SYNC_REPOS_PER_JOB = 20

// How long an index job waits after it paused on a low GitHub rate budget.
export const INDEX_RATE_PAUSE_SECONDS = 600

// Rule hits that send a push to the tenant's runner. Only npm projects are
// detonated, so only JavaScript supply-chain rules gate it.
export const DETONATION_GATE = [
  "js-install-hook-added",
  "js-lockfile-only-change",
  "js-dependency-from-url",
  "js-npmrc-changed",
  "js-patch-package",
] as const

// Files whose change can add a dependency, and so trigger the dependency check.
export const DEPENDENCY_MANIFESTS = [
  "**/package.json",
  "**/package-lock.json",
  "**/npm-shrinkwrap.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
  "**/requirements*.txt",
  "**/Pipfile.lock",
  "**/poetry.lock",
  "**/go.sum",
  "**/Cargo.lock",
  "**/Gemfile.lock",
  "**/composer.lock",
]

// The first webhook in each window queues a reconcile of the delivery log. The
// lookback is GitHub's log retention, so the first webhook after an outage of up
// to three days recovers it; past MAX_DELIVERY_PAGES the oldest are not read.
export const RECONCILE_WINDOW_SECONDS = 900
export const RECONCILE_LOOKBACK_MS = 72 * 60 * 60 * 1000
export const MAX_REDELIVERIES_PER_RUN = 20
export const MAX_DELIVERY_ATTEMPTS = 3

// GitHub requests one push job keeps in flight across its parallel stages.
export const PUSH_GITHUB_CONCURRENCY = 4

// How long a merge-looking push waits, once, for its pull_request webhook.
export const REVIEW_DEFER_SECONDS = 10

// A push, pull request or index job for a repository already being worked on
// waits this long and tries again. The lease outlives any one job.
export const REPO_LOCK_RETRY_SECONDS = 5
export const REPO_LOCK_LEASE_SECONDS = JOB_VISIBILITY_SECONDS

// AI rules run this long after the first push of a burst, over the whole burst.
// A waiting range older than the stale mark lost its job and is queued again.
export const AI_REVIEW_DELAY_SECONDS = 60
export const AI_REVIEW_STALE_SECONDS = 600
