import type { ChangedFile } from "@/lib/engine"
import type { PullRequestPayload, PushPayload } from "@/schemas/webhook"

export const EMPTY_SHA = "0".repeat(40)

// What an alert needs to know about the change that raised it, whichever
// GitHub event delivered it.
export type ChangeEvent = {
  repo: string
  private: boolean
  branch: string
  sender: string
  senderEmail: string | null
  before: string
  after: string
  forced: boolean
  files: ChangedFile[]
  pullRequest?: { number: number; base: string; url: string; draft: boolean }
}

// Later commits win: a file added then modified in one push is "added".
export function changedFilesOf(payload: PushPayload): ChangedFile[] {
  const files = new Map<string, ChangedFile["changeType"]>()
  for (const commit of payload.commits) {
    for (const path of commit.added) files.set(path, "added")
    for (const path of commit.modified) if (!files.has(path)) files.set(path, "modified")
    for (const path of commit.removed) files.set(path, "removed")
  }
  return [...files.entries()].map(([path, changeType]) => ({ path, changeType }))
}

export function fromPush(payload: PushPayload): ChangeEvent {
  return {
    repo: payload.repository.full_name,
    private: payload.repository.private,
    branch: payload.ref.replace("refs/heads/", ""),
    sender: payload.sender.login,
    senderEmail: payload.pusher.email ?? null,
    before: payload.before,
    after: payload.after,
    forced: payload.forced,
    files: changedFilesOf(payload),
  }
}

export function fromPullRequest(payload: PullRequestPayload, files: ChangedFile[]): ChangeEvent {
  const { pull_request: pr } = payload
  return {
    repo: payload.repository.full_name,
    private: payload.repository.private,
    branch: pr.head.ref,
    sender: payload.sender.login,
    senderEmail: null,
    before: pr.base.sha,
    after: pr.head.sha,
    forced: false,
    files,
    pullRequest: { number: payload.number, base: pr.base.ref, url: pr.html_url, draft: pr.draft },
  }
}
