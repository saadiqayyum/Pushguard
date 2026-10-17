// The runner is dispatched through Actions, whose queue can take minutes to start a job.
export const FETCH_NONCE_TTL_MS = 15 * 60 * 1000

// Workflow timeout-minutes is 30; past this a report is refused and the job reads as timed out.
export const REPORT_TOKEN_TTL_MS = 40 * 60 * 1000

export const RUNNER_TOKEN_BYTES = 32

// Requests per window per client address, across both runner endpoints.
export const RUNNER_REQUESTS_PER_WINDOW = 30
export const RUNNER_RATE_WINDOW_SECONDS = 60

// A repository tarball larger than this is not detonated; the stream is cut.
export const TARBALL_MAX_BYTES = 200 * 1024 * 1024

export const REPORT_MAX_BYTES = 2_000_000

// Time budget per phase, mirrored by the detonator. A claim above budget plus slack is suspect.
export const PHASE_BUDGET_MS = { install: 600_000, import: 120_000, execute: 300_000, check: 120_000, scan: 600_000 } as const
export const PHASE_SLACK_MS = 30_000

// Overdue jobs closed per sweep.
export const MAX_EXPIRED_PER_SWEEP = 100

// The label is the trigger: its name carries the nonce, its description the kind and endpoint.
export const RUNNER_LABEL_PREFIX = "pg-"
export const RUNNER_DESCRIPTION_PREFIX = "pushguard:"
export const MAX_LABEL_NAME = 50
export const MAX_LABEL_DESCRIPTION = 100
export const RUNNER_LABEL_COLOR = "6e7781"

// Distinct scanner rules turned into findings per job.
export const MAX_SCANNER_GROUPS = 50

// Binaries an install script has little reason to run.
export const SUSPICIOUS_PROCESSES = new Set(["curl", "wget", "nc", "ncat", "netcat", "socat", "base64", "openssl", "ssh", "scp", "python", "python3", "perl", "powershell", "pwsh"])

// Detonations per org per calendar month on the Pushguard-hosted runner. An org's own runner is not capped.
export const SHARED_RUNNER_MONTHLY_QUOTA = 20
