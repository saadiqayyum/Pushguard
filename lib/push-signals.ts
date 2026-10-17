import { EMPTY_SHA } from "@/lib/change-event"
import type { ScanFinding } from "@/lib/db"
import { toFinding } from "@/lib/finding"
import type { PushPayload } from "@/schemas/webhook"

export const TAG_MOVED = {
  id: "tag-moved",
  severity: "critical" as const,
  description: "An existing tag now points at a different commit",
}

// Anyone pinning this tag, including every workflow using it as an action
// version, now runs the new commit.
export function tagMovedFinding(payload: PushPayload): ScanFinding | null {
  if (!payload.ref.startsWith("refs/tags/") || payload.created || payload.deleted || payload.before === EMPTY_SHA) {
    return null
  }
  const tag = payload.ref.replace("refs/tags/", "")
  return toFinding(TAG_MOVED, payload.repository.full_name, [], [
    `${tag} moved from ${payload.before.slice(0, 7)} to ${payload.after.slice(0, 7)} by @${payload.sender.login}.`,
  ], { prose: true })
}
