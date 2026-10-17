import { MAX_RULESETS_READ, TAGS_PER_PAGE } from "@/lib/ci-limits"
import { AppError } from "@/lib/errors"
import { client, github, splitRepo } from "@/lib/github"

// Tags, rulesets, reachability and run logs: the GitHub reads behind the
// tag-repointing defenses. Split from lib/github.ts, which owns the client.

const statusOf = (error: unknown) => ((error as { cause?: { status?: number } }).cause?.status ?? (error as { status?: number }).status)
const isGone = (error: unknown) => error instanceof AppError && (error.code === "not_found" || statusOf(error) === 410)

export async function repoDefaultBranch(installationId: number, repo: string): Promise<string | null> {
  try {
    const response = await github("repo", async () =>
      (await client(installationId)).request("GET /repos/{owner}/{repo}", splitRepo(repo)),
    )
    return response.data.default_branch
  } catch (error) {
    if (isGone(error)) return null
    throw error
  }
}

// The compare status of `base...head`, or null when GitHub has no such commit.
export async function compareStatus(installationId: number, repo: string, base: string, head: string): Promise<string | null> {
  try {
    const response = await github("compare status", async () =>
      (await client(installationId)).request("GET /repos/{owner}/{repo}/compare/{basehead}", {
        ...splitRepo(repo),
        basehead: `${base}...${head}`,
        per_page: 1,
      }),
    )
    return response.data.status
  } catch (error) {
    if (isGone(error)) return null
    throw error
  }
}

export type TagRef = { tag: string; sha: string }

// Newest first, as GitHub lists them. `truncated` when the repository has more than `max`.
export async function listTags(installationId: number, repo: string, max: number): Promise<{ tags: TagRef[]; truncated: boolean }> {
  const octokit = await client(installationId)
  const tags: TagRef[] = []
  for (let page = 1; tags.length < max; page++) {
    const response = await github("list tags", () =>
      octokit.request("GET /repos/{owner}/{repo}/tags", { ...splitRepo(repo), per_page: TAGS_PER_PAGE, page }),
    )
    tags.push(...response.data.map((t) => ({ tag: t.name, sha: t.commit.sha })))
    if (response.data.length < TAGS_PER_PAGE) return { tags, truncated: false }
  }
  return { tags: tags.slice(0, max), truncated: true }
}

// Whether the repository ships an action or releases, so consumers pin its tags.
export async function publishesAction(installationId: number, repo: string): Promise<boolean> {
  const octokit = await client(installationId)
  for (const path of ["action.yml", "action.yaml"]) {
    try {
      await github("read action", () => octokit.request("GET /repos/{owner}/{repo}/contents/{path}", { ...splitRepo(repo), path }))
      return true
    } catch (error) {
      if (!isGone(error)) throw error
    }
  }
  const releases = await github("list releases", () =>
    octokit.request("GET /repos/{owner}/{repo}/releases", { ...splitRepo(repo), per_page: 1 }),
  )
  return releases.data.length > 0
}

// An active tag ruleset that blocks both update and deletion. Which tag names
// it covers is not checked. A plan without rulesets answers 404: unprotected.
export async function tagsProtected(installationId: number, repo: string): Promise<boolean> {
  const octokit = await client(installationId)
  let listed: { id: number; target?: string; enforcement: string }[]
  try {
    const response = await github("list rulesets", () =>
      octokit.request("GET /repos/{owner}/{repo}/rulesets", { ...splitRepo(repo), per_page: MAX_RULESETS_READ }),
    )
    listed = response.data
  } catch (error) {
    if (isGone(error)) return false
    throw error
  }
  for (const ruleset of listed.filter((r) => r.target === "tag" && r.enforcement === "active")) {
    const detail = await github("read ruleset", () =>
      octokit.request("GET /repos/{owner}/{repo}/rulesets/{ruleset_id}", { ...splitRepo(repo), ruleset_id: ruleset.id }),
    )
    const types = new Set((detail.data.rules ?? []).map((rule) => rule.type))
    if (types.has("update") && types.has("deletion")) return true
  }
  return false
}

// The run's log archive, capped. Null when the logs are gone (expired or deleted).
export async function downloadRunLogs(installationId: number, repo: string, runId: number, maxBytes: number): Promise<Buffer | null> {
  let response
  try {
    response = await github("run logs", async () =>
      (await client(installationId)).request("GET /repos/{owner}/{repo}/actions/runs/{run_id}/logs", {
        ...splitRepo(repo),
        run_id: runId,
        request: { parseSuccessResponseBody: false },
      }),
    )
  } catch (error) {
    if (isGone(error)) return null
    throw error
  }
  const reader = (response.data as unknown as ReadableStream<Uint8Array>).getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    size += next.value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      throw new AppError("payload_too_large", "Run logs exceed cap")
    }
    chunks.push(next.value)
  }
  return Buffer.concat(chunks)
}
