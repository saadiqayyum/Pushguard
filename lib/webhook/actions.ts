import { z } from "zod"
import { TAG_SNAPSHOT_DEBOUNCE_SECONDS } from "@/lib/ci-limits"
import { activeInstallation, enqueueJob, hit } from "@/lib/db"
import { ownerOf } from "@/lib/finding"

const repoOnly = z.object({ repository: z.object({ full_name: z.string().regex(/^[^/\s]+\/[^/\s]+$/).max(200) }) })

const workflowRunPayload = z.object({
  action: z.string().max(50),
  repository: z.object({ full_name: z.string().max(200), owner: z.object({ login: z.string().max(100) }) }),
  workflow_run: z.object({
    id: z.number().int().positive(),
    name: z.string().max(200).nullish(),
    path: z.string().max(1024),
    head_sha: z.string().regex(/^[0-9a-f]{40}$/i),
    html_url: z.string().max(500),
  }),
})

// Any event for a repository refreshes its tag snapshot, at most once per
// window. The window's first hit is the trigger, so no timer is needed.
export async function queueTagSnapshot(raw: string): Promise<void> {
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return
  }
  const parsed = repoOnly.safeParse(body)
  if (!parsed.success) return
  const repo = parsed.data.repository.full_name
  if ((await hit(`tag-snapshot:${repo}`, TAG_SNAPSHOT_DEBOUNCE_SECONDS)).count !== 1) return
  if (await activeInstallation(ownerOf(repo))) await enqueueJob({ type: "tag_snapshot", repo })
}

export async function handleWorkflowRun(raw: string): Promise<number> {
  const payload = workflowRunPayload.parse(JSON.parse(raw))
  if (payload.action !== "completed" || !(await activeInstallation(payload.repository.owner.login))) return 204
  const run = payload.workflow_run
  await enqueueJob({
    type: "workflow_logs",
    repo: payload.repository.full_name,
    runId: run.id,
    workflowPath: run.path.split("@")[0],
    headSha: run.head_sha,
    name: run.name ?? run.path,
    url: run.html_url,
  })
  return 202
}

// A published release makes the repository something consumers pin.
export async function handleRelease(raw: string): Promise<number> {
  const payload = repoOnly.extend({ action: z.string().max(50) }).parse(JSON.parse(raw))
  const repo = payload.repository.full_name
  if (payload.action !== "published" || !(await activeInstallation(ownerOf(repo)))) return 204
  await enqueueJob({ type: "tag_posture", repo })
  return 202
}
