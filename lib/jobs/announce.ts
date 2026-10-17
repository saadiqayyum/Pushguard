import { installationById, scanById } from "@/lib/db"
import { ownerOf } from "@/lib/finding"
import { announce, type LiveEvent } from "@/lib/realtime"
import type { JobMessage } from "@/schemas/job"

const EVENTS: Partial<Record<JobMessage["type"], LiveEvent>> = {
  sync_repos: "sync",
  sync_repo_access: "sync",
  sync_org_members: "sync",
  sync_team_repo: "sync",
  sync_team_member: "sync",
  register_installation: "installation",
  push: "alert",
  pull_request: "alert",
  public_alert: "alert",
  settings_alert: "alert",
  runner_report: "alert",
  runner_deadline: "alert",
  review_session: "alert",
  investigate: "alert",
  ai_review: "alert",
  tag_snapshot: "alert",
  tag_posture: "alert",
  workflow_logs: "alert",
  dependabot_malware: "alert",
  scan: "scan",
  file_scan: "scan",
}

// The org a job belongs to and what it was about, for announcing and for
// recording a failure against the right thing.
export async function jobScope(message: JobMessage): Promise<{ org: string; subject: string } | null> {
  const org = await orgOf(message)
  if (!org) return null
  const subject =
    "repo" in message ? message.repo : "id" in message ? message.id : "payload" in message ? message.payload.repository.full_name : org
  return { org, subject }
}

async function orgOf(message: JobMessage): Promise<string | null> {
  switch (message.type) {
    case "push":
    case "pull_request":
      return message.payload.repository.owner.login
    case "public_alert":
    case "ai_review":
    case "settings_alert":
    case "sync_repo_access":
    case "tag_snapshot":
    case "tag_posture":
    case "workflow_logs":
      return ownerOf(message.repo)
    case "sync_org_members":
    case "sync_team_repo":
    case "sync_team_member":
      return message.org
    case "scan":
    case "file_scan":
      return (await scanById(message.id))?.account ?? null
    default:
      return "installationId" in message ? ((await installationById(message.installationId))?.org ?? null) : null
  }
}

// Tells open dashboards of the affected org that a finished job changed something.
export async function announceJob(message: JobMessage): Promise<void> {
  const event = EVENTS[message.type]
  if (!event) return
  const org = await orgOf(message)
  if (org) await announce(org, event)
}
