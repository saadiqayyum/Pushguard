// A generated file declares thousands of names; past this the rest are noise.
export const MAX_SYMBOLS_PER_FILE = 2_000
export const MAX_SYMBOL_NAME = 200

// Facts are labels, never source: a host, a variable name, a rule id.
export const MAX_FACTS_PER_FILE = 200
export const MAX_FACT_DETAIL = 120

// Removed facts are kept this long so history can still show who added them.
export const FACT_RETENTION_DAYS = 180
export const MAX_RETENTION_DELETE = 5_000

// Files the push job reads for facts: one GraphQL blob batch.
export const MAX_INTEL_FILES_PER_PUSH = 40

// Rows any one read returns, whatever limit the caller asks for.
export const MAX_INTEL_ROWS = 500

// Bounds on one trace, so a dense call graph cannot exhaust the job budget.
export const MAX_TRACE_DEPTH = 6
export const MAX_TRACE_ENTRIES = 50
export const MAX_TRACE_NODES = 400
export const MAX_DEFINITIONS_PER_NAME = 5
export const MAX_SINKS_PER_ENTRY = 3
export const MAX_SOURCES_PER_PATH = 3

// Paths filed per push; the rest are logged.
export const MAX_PATHS_PER_PUSH = 5

// How far back defence erosion counts as near a capability gain, and how new a
// path's latest fact must be to rank as recent.
export const DEFENSE_WINDOW_DAYS = 30
export const RECENT_PATH_DAYS = 7

// A literal this long and this random is a payload, not a message.
export const OPAQUE_LITERAL_MIN = 200
export const OPAQUE_ENTROPY_BITS = 4.5

export const DAY_MS = 86_400_000
