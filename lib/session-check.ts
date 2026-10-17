export type SessionStatus = "unknown" | "signed-in" | "signed-out"

// What a click on Dashboard or Install does. Unknown after a failed check falls
// through to the link, where the server guard decides.
export function clickAction(status: SessionStatus): "navigate" | "dialog" | "wait" {
  if (status === "signed-out") return "dialog"
  return status === "signed-in" ? "navigate" : "wait"
}
