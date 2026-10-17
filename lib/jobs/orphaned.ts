import { installationExists } from "@/lib/db"
import { ownerOf } from "@/lib/finding"
import type { JobMessage } from "@/schemas/job"

// A job queued for an org whose data was deleted on uninstall is dropped
// rather than run, so it cannot write rows back. Registration precedes the row.
export async function orphaned(message: JobMessage): Promise<boolean> {
  if (message.type === "register_installation") return false
  if ("installationId" in message) return !(await installationExists({ installationId: message.installationId }))
  const org = "payload" in message ? message.payload.repository.owner.login : "repo" in message ? ownerOf(message.repo) : null
  return org !== null && !(await installationExists({ org }))
}
