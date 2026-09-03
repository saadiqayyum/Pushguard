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

// Quota rows are read for today only, so yesterday's collect themselves.
export const AI_USAGE_TTL_SECONDS = 172_800;

// Background work claimed but never reported back. The invocation that owned it
// was cut off, so it goes back in the queue rather than staying claimed forever.
export const STUCK_AFTER_MS = 5 * 60 * 1000;

// Rows moved per collection when a repository is renamed. Beyond this the
// remainder is logged and left behind rather than rewriting a collection.
export const MAX_RENAME_ROWS = 2_000;

// Open pull requests seeded per repository. Past this the tab shows the newest
// and the webhook keeps it current from there.
export const MAX_OPEN_PULL_REQUESTS_PER_REPO = 100;
