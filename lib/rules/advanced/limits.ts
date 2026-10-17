// Per push: rules evaluated beyond the pattern engine (live before shadow) and
// responses run across every hit.
export const MAX_ADVANCED_RULES_PER_PUSH = 100
export const MAX_RESPONSES_PER_PUSH = 20

// Staff rule rows read per load; anything past this is a catalogue bug, logged.
export const MAX_STAFF_RULES_LOADED = 500

// Shadow hits kept per staff rule version; older ones are dropped on insert.
export const MAX_SHADOW_HITS_PER_VERSION = 1_000
