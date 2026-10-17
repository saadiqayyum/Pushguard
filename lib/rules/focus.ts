// What a rule's "investigate" response may ask the investigator to focus on.
// Rules carry only the id, so no stored text ever reaches a model as instructions.
export const INVESTIGATE_FOCUS = {
  "install-hook-exfil":
    "Focus on install, build and CI entry points. Decide whether code reachable from them reads credentials, environment or local files and sends them anywhere.",
  "staged-payload":
    "Focus on code that decodes, decrypts or assembles data at runtime and then evaluates or executes it. Follow the data back to where it was introduced, across commits.",
  "ci-secret-exfil":
    "Focus on workflow changes. Decide whether a job can expose repository secrets or tokens to code or input an outsider controls, or send them off the runner.",
  "dormant-activation":
    "Focus on conditions that gate behaviour on dates, hosts, environment or remote state. Decide what the code does once the condition holds.",
  "dependency-takeover":
    "Focus on dependency and lockfile changes. Decide whether an added or repointed package runs code on install or replaces a trusted one.",
} as const satisfies Record<string, string>

export type FocusId = keyof typeof INVESTIGATE_FOCUS

export const FOCUS_IDS = Object.keys(INVESTIGATE_FOCUS) as [FocusId, ...FocusId[]]

export const FOCUS_LABELS: Record<FocusId, string> = {
  "install-hook-exfil": "Install hooks sending data out",
  "staged-payload": "Payload assembled at runtime",
  "ci-secret-exfil": "CI secrets exposed",
  "dormant-activation": "Code that waits for a trigger",
  "dependency-takeover": "Dependency takeover",
}
