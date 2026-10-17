import { App } from "@octokit/app"
import { Octokit } from "@octokit/core"
import { retry } from "@octokit/plugin-retry"
import { throttling } from "@octokit/plugin-throttling"
import { collectPatchLines, type FileLines } from "@/lib/diff-lines"
import { githubMeterPlugin } from "@/lib/github-meter"
import { env } from "@/lib/env"
import { AppError } from "@/lib/errors"
import {
  classifyGitHubError,
  GITHUB_DO_NOT_RETRY,
  GITHUB_MAX_RETRIES,
  MAX_ORG_MEMBERS,
  shouldRetryRateLimit,
  MAX_DELIVERY_PAGES,
  MAX_USER_INSTALLATIONS,
  MAX_REGISTERED_REPOS,
} from "@/lib/github-limits"
import { logger } from "@/lib/logger"
import { RUNNER_LABEL_COLOR } from "@/lib/runner/limits"
import { SCAN_COMMIT_WINDOW } from "@/lib/paging"
import { scanRange } from "@/lib/scan-range"
import type { ChangeType } from "@/schemas/rule"

function onLimit(event: string) {
  return (retryAfter: number, options: { method: string; url: string }, _octokit: unknown, retryCount: number) => {
    const retry = shouldRetryRateLimit(retryAfter, retryCount)
    logger.warn(event, { method: options.method, url: options.url, retryAfter, retryCount, retry })
    return retry
  }
}

const GitHubOctokit = Octokit.plugin(throttling, retry, githubMeterPlugin as never).defaults({
  throttle: {
    onRateLimit: onLimit("github_rate_limited"),
    onSecondaryRateLimit: onLimit("github_secondary_rate_limited"),
  },
  retry: { retries: GITHUB_MAX_RETRIES, doNotRetry: GITHUB_DO_NOT_RETRY },
})

export type GitHubClient = InstanceType<typeof GitHubOctokit>

let app: App | null = null

function githubApp(): App {
  app ??= new App({
    appId: env().GITHUB_APP_ID,
    privateKey: env().GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"),
    Octokit: GitHubOctokit,
  })
  return app
}

// Octokit caches installation tokens internally per installation.
export function client(installationId: number): Promise<GitHubClient> {
  return githubApp().getInstallationOctokit(installationId) as Promise<GitHubClient>
}

export async function github<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    const { code, retryAfterSeconds } = classifyGitHubError(error)
    throw new AppError(code, `GitHub ${operation} failed`, { cause: error, retryAfterSeconds })
  }
}

export function splitRepo(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split("/")
  return { owner, repo }
}

// Did this commit reach the branch through a pull request?
export async function commitReachedViaPullRequest(
  installationId: number,
  repoFullName: string,
  sha: string,
): Promise<boolean | null> {
  try {
    const response = await (await client(installationId)).request(
      "GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls",
      { ...splitRepo(repoFullName), commit_sha: sha, per_page: 1 },
    )
    return response.data.length > 0
  } catch (error) {
    logger.warn("pull_request_lookup_failed", {
      repo: repoFullName,
      sha,
      status: (error as { status?: number }).status,
    })
    return null
  }
}


export type TreeEntry = { path: string; blobSha: string; size: number }

export type RepoTree = {
  entries: TreeEntry[]
  truncated: boolean
}

// Every path in the repository at one commit, in a single request. A repository
// with no commits answers 409; it has no paths, which is a result, not a failure.
export async function fetchRepoTree(
  installationId: number,
  repoFullName: string,
  ref: string,
): Promise<RepoTree> {
  return github("read tree", async () => {
    const response = await (await client(installationId))
      .request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
        ...splitRepo(repoFullName),
        tree_sha: ref,
        recursive: "1",
      })
      .catch((error: { status?: number }) => {
        if (error.status === 409) return null
        throw error
      })
    if (response === null) return { entries: [], truncated: false }
    const entries = response.data.tree
      .filter((node) => node.type === "blob" && node.path && node.sha)
      .map((node) => ({ path: node.path!, blobSha: node.sha!, size: node.size ?? 0 }))
    return { entries, truncated: Boolean(response.data.truncated) }
  })
}

// Files per GraphQL request. Response size is the real ceiling, not node count.
export const BLOB_BATCH = 40

export type BlobBatch = {
  files: Map<string, string>
  oids: Map<string, string>
  binary: Set<string>
  remaining: number | null
}

// Many files in one request, by aliasing a query per path.
export async function fetchBlobs(
  installationId: number,
  repoFullName: string,
  sha: string,
  paths: string[],
): Promise<BlobBatch> {
  const files = new Map<string, string>()
  const oids = new Map<string, string>()
  const binary = new Set<string>()
  if (paths.length === 0) return { files, oids, binary, remaining: null }

  return github("read blobs", async () => {
    const octokit = await client(installationId)
    const { owner, repo } = splitRepo(repoFullName)
    const wanted = paths.slice(0, BLOB_BATCH)

    const declarations = wanted.map((_, i) => `$e${i}: String!`).join(", ")
    const selections = wanted
      .map((_, i) => `f${i}: object(expression: $e${i}) { ... on Blob { oid text isTruncated isBinary } }`)
      .join("\n      ")
    const variables: Record<string, string> = { owner, repo }
    wanted.forEach((path, i) => {
      variables[`e${i}`] = `${sha}:${path}`
    })

    const result = await octokit.graphql<{
      rateLimit?: { remaining: number }
      repository: Record<string, { oid?: string; text?: string | null; isTruncated?: boolean; isBinary?: boolean | null } | null>
    }>(
      `query($owner: String!, $repo: String!, ${declarations}) {
      rateLimit { remaining }
      repository(owner: $owner, name: $repo) {
      ${selections}
      }
    }`,
      variables,
    )

    wanted.forEach((path, i) => {
      const blob = result.repository?.[`f${i}`]
      if (blob?.oid) oids.set(path, blob.oid)
      if (blob?.isBinary) binary.add(path)
      if (blob?.text && !blob.isTruncated) files.set(path, blob.text)
    })

    return { files, oids, binary, remaining: result.rateLimit?.remaining ?? null }
  })
}

// One file at a commit, raw. Blob text over GraphQL truncates large lockfiles;
// the contents API serves the bytes. The caller checks size from the tree first.
export async function fetchRawFile(installationId: number, repoFullName: string, ref: string, path: string): Promise<string> {
  return github("read file", async () => {
    const response = await (await client(installationId)).request("GET /repos/{owner}/{repo}/contents/{path}", {
      ...splitRepo(repoFullName),
      path,
      ref,
      mediaType: { format: "raw" },
    })
    return response.data as unknown as string
  })
}

export type CompareFile = {
  path: string
  status: string
  additions: number
  deletions: number
  patch?: string
  sha?: string
  previousPath?: string
}

// Per-file stats and hunks for one range. What a review needs to know where to
// look, as opposed to the whole tree.
export async function fetchCompareFiles(
  installationId: number,
  repoFullName: string,
  base: string,
  head: string,
): Promise<{ files: CompareFile[]; truncated: boolean }> {
  return github("compare files", async () => {
    const response = await (await client(installationId)).request(
      "GET /repos/{owner}/{repo}/compare/{basehead}",
      { ...splitRepo(repoFullName), basehead: `${base}...${head}` },
    )
    const raw = (response.data.files ?? []) as {
      filename: string
      status: string
      additions?: number
      deletions?: number
      patch?: string
      sha?: string
      previous_filename?: string
    }[]
    return {
      files: raw.map((file) => ({
        path: file.filename,
        status: file.status,
        additions: file.additions ?? 0,
        deletions: file.deletions ?? 0,
        patch: file.patch,
        sha: file.sha,
        previousPath: file.previous_filename,
      })),
      truncated: raw.length >= COMPARE_FILE_LIMIT,
    }
  })
}

export type DependencyChange = {
  name: string
  version: string
  ecosystem: string
  manifest: string
  previous?: string
  vulnerabilities: { severity: string; summary: string; advisory: string }[]
}

// Every package this range added. Null when the repository has no dependency
// graph enabled, which 404s.
export async function fetchAddedDependencies(
  installationId: number,
  repoFullName: string,
  base: string,
  head: string,
): Promise<DependencyChange[] | null> {
  try {
    const response = await (await client(installationId)).request(
      "GET /repos/{owner}/{repo}/dependency-graph/compare/{basehead}",
      { ...splitRepo(repoFullName), basehead: `${base}...${head}` },
    )
    const rows = response.data as unknown as {
      change_type: string
      name: string
      version: string
      ecosystem: string
      manifest: string
      vulnerabilities?: { severity: string; advisory_summary: string; advisory_ghsa_id: string }[]
    }[]
    const removed = new Map(
      rows.filter((row) => row.change_type === "removed").map((row) => [[row.ecosystem, row.manifest, row.name].join("\0"), row.version]),
    )
    return rows
      .filter((row) => row.change_type === "added")
      .map((row) => ({
        name: row.name,
        version: row.version,
        ecosystem: row.ecosystem,
        manifest: row.manifest,
        previous: removed.get([row.ecosystem, row.manifest, row.name].join("\0")),
        vulnerabilities: (row.vulnerabilities ?? []).map((v) => ({
          severity: v.severity,
          summary: v.advisory_summary,
          advisory: v.advisory_ghsa_id,
        })),
      }))
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status === 404 || status === 403) {
      logger.info("dependency_graph_unavailable", { repo: repoFullName, status })
      return null
    }
    logger.warn("dependency_review_failed", { repo: repoFullName, status })
    return null
  }
}

// Added packages with a known advisory against them.
export async function fetchDependencyChanges(
  installationId: number,
  repoFullName: string,
  base: string,
  head: string,
): Promise<DependencyChange[] | null> {
  const added = await fetchAddedDependencies(installationId, repoFullName, base, head)
  return added && added.filter((dep) => dep.vulnerabilities.length > 0)
}

// Everyone who can read a repository, as GitHub computes it, org role, team.
export type Collaborator = { login: string; write: boolean }

export async function listRepoCollaborators(
  installationId: number,
  repoFullName: string,
): Promise<Collaborator[]> {
  return github("list collaborators", async () => {
    const octokit = await client(installationId)
    const { owner, repo } = splitRepo(repoFullName)
    const collaborators: Collaborator[] = []
    for (let page = 1; page <= 5; page++) {
      const response = await octokit.request("GET /repos/{owner}/{repo}/collaborators", {
        owner,
        repo,
        affiliation: "all",
        per_page: 100,
        page,
      })
      collaborators.push(
        ...response.data.map((user) => ({
          login: user.login,
          write: Boolean(
            user.permissions?.push || user.permissions?.triage || user.permissions?.admin,
          ),
        })),
      )
      if (response.data.length < 100) break
    }
    return collaborators
  })
}

// Branches and default branch on the installation's own credentials, for the
// stored projection the branch picker reads.
export async function fetchRepoBranches(
  installationId: number,
  repoFullName: string,
  limit = 100,
): Promise<RepoBranches> {
  return github("sync branches", async () => {
    const octokit = await client(installationId)
    const { owner, repo } = splitRepo(repoFullName)
    const [meta, branches] = await Promise.all([
      octokit.request("GET /repos/{owner}/{repo}", { owner, repo }),
      octokit.request("GET /repos/{owner}/{repo}/branches", { owner, repo, per_page: limit }),
    ])
    const defaultBranch = meta.data.default_branch
    return {
      defaultBranch,
      branches: [defaultBranch, ...branches.data.map((b) => b.name).filter((n) => n !== defaultBranch)],
      archived: meta.data.archived,
      private: meta.data.private,
    }
  })
}

// Members of one team, for the membership and team webhooks.
export async function listTeamMembers(installationId: number, org: string, teamSlug: string): Promise<string[]> {
  return github("list team members", async () => {
    const response = await (await client(installationId)).request(
      "GET /orgs/{org}/teams/{team_slug}/members",
      { org, team_slug: teamSlug, per_page: 100 },
    )
    return response.data.map((user) => user.login)
  })
}

// Everyone in an organization with their role, for the org_members projection.
export async function listOrgMembers(
  installationId: number,
  org: string,
): Promise<{ members: { login: string; role: "admin" | "member" }[]; truncated: boolean }> {
  return github("list organization members", async () => {
    const octokit = await client(installationId)
    const members: { login: string; role: "admin" | "member" }[] = []
    let truncated = false
    for (const role of ["admin", "member"] as const) {
      for (let page = 1; ; page++) {
        if (members.length >= MAX_ORG_MEMBERS) {
          truncated = true
          break
        }
        const response = await octokit.request("GET /orgs/{org}/members", { org, role, per_page: 100, page })
        members.push(...response.data.map((user) => ({ login: user.login, role })))
        if (response.data.length < 100) break
      }
    }
    return { members: members.slice(0, MAX_ORG_MEMBERS), truncated }
  })
}

// Repositories one team can reach, for the same events.
export async function listTeamRepos(installationId: number, org: string, teamSlug: string): Promise<string[]> {
  return github("list team repositories", async () => {
    const response = await (await client(installationId)).request(
      "GET /orgs/{org}/teams/{team_slug}/repos",
      { org, team_slug: teamSlug, per_page: 100 },
    )
    return response.data.map((repo) => repo.full_name)
  })
}

export type OpenPullRequest = {
  number: number
  title: string
  author: string
  headRef: string
  headSha: string
  baseRef: string
  draft: boolean
  url: string
  openedAt: Date
  updatedAt: Date
}

export async function listOpenPullRequests(
  installationId: number,
  repoFullName: string,
  limit: number,
): Promise<OpenPullRequest[]> {
  return github("list pull requests", async () => {
    const response = await (await client(installationId)).request("GET /repos/{owner}/{repo}/pulls", {
      ...splitRepo(repoFullName),
      state: "open",
      sort: "updated",
      direction: "desc",
      per_page: Math.min(limit, 100),
    })
    return response.data.slice(0, limit).map((pr) => ({
      number: pr.number,
      title: pr.title,
      author: pr.user?.login ?? "unknown",
      headRef: pr.head.ref,
      headSha: pr.head.sha,
      baseRef: pr.base.ref,
      draft: pr.draft ?? false,
      url: pr.html_url,
      openedAt: new Date(pr.created_at),
      updatedAt: new Date(pr.updated_at),
    }))
  })
}

export type RepoBranches = {
  branches: string[]
  defaultBranch: string
  archived?: boolean
  private?: boolean
}

export type CreatedIssue = { html_url: string; number: number }

export async function createAlertIssue(
  installationId: number,
  repo: string,
  title: string,
  body: string,
  labels: string[],
  assignees: string[] = [],
): Promise<CreatedIssue> {
  return github("create issue", async () => {
    const response = await (await client(installationId)).request("POST /repos/{owner}/{repo}/issues", {
      ...splitRepo(repo),
      title,
      body,
      labels,
      assignees,
    })
    return { html_url: response.data.html_url, number: response.data.number }
  })
}

export async function addIssueLabels(
  installationId: number,
  repoFullName: string,
  number: number,
  labels: string[],
): Promise<void> {
  await github("label issue", async () =>
    (await client(installationId)).request("POST /repos/{owner}/{repo}/issues/{issue_number}/labels", {
      ...splitRepo(repoFullName),
      issue_number: number,
      labels,
    }),
  )
}

export async function commentOnIssue(
  installationId: number,
  repoFullName: string,
  number: number,
  body: string,
): Promise<void> {
  await github("comment on issue", async () =>
    (await client(installationId)).request("POST /repos/{owner}/{repo}/issues/{issue_number}/comments", {
      ...splitRepo(repoFullName),
      issue_number: number,
      body,
    }),
  )
}

export async function closeIssue(installationId: number, repoFullName: string, number: number): Promise<void> {
  await github("close issue", async () =>
    (await client(installationId)).request("PATCH /repos/{owner}/{repo}/issues/{issue_number}", {
      ...splitRepo(repoFullName),
      issue_number: number,
      state: "closed",
    }),
  )
}

export type AlertPage = { issues: AlertIssue[]; total: number; hasMore: boolean }

export type AlertIssue = {
  number: number
  repo: string
  title: string
  html_url: string
  state: string
  created_at: string
  labels: { name: string }[]
}

// GitHub's compare endpoint stops listing files at 300.
const COMPARE_FILE_LIMIT = 300

export type RepoSnapshot = {
  repo: string
  branch: string
  files: { path: string; changeType: ChangeType }[]
  addedLines: FileLines
  commits: number
  truncated: boolean
  headSha: string
  baseSha: string | null
}

function toChangeType(status: string): ChangeType {
  if (status === "added" || status === "copied") return "added"
  if (status === "removed") return "removed"
  return "modified"
}

type ChangedFile = { filename: string; status: string; patch?: string }

function collectAddedLines(files: ChangedFile[]): { addedLines: FileLines; truncated: boolean } {
  const { added, truncated } = collectPatchLines(files.map((file) => ({ path: file.filename, patch: file.patch })))
  return { addedLines: added, truncated }
}

// Recent history for one repository, shaped like the push payload the engine
// reads. A repository with no commits answers 409 and reads as zero commits.
export async function fetchRepoSnapshot(
  repoFullName: string,
  installationId: number,
  requestedBranch?: string,
): Promise<RepoSnapshot> {
  return github("read repository", async () => {
    const octokit = await client(installationId)
    const { owner, repo } = splitRepo(repoFullName)

    const branch =
      requestedBranch ||
      (await octokit.request("GET /repos/{owner}/{repo}", { owner, repo })).data.default_branch
    const base = { repo: repoFullName, branch }

    const history = await octokit
      .request("GET /repos/{owner}/{repo}/commits", { owner, repo, sha: branch, per_page: SCAN_COMMIT_WINDOW })
      .catch((error: { status?: number }) => {
        if (error.status === 409) return { data: [] }
        throw error
      })
    if (history.data.length === 0) {
      return { ...base, files: [], addedLines: new Map(), commits: 0, truncated: false, headSha: "", baseSha: null }
    }

    const range = scanRange(history.data)!
    const head = history.data[0].sha
    const baseSha = range.kind === "compare" ? range.base : range.kind === "root" ? range.root : null

    const commitFiles = async (ref: string) =>
      ((await octokit.request("GET /repos/{owner}/{repo}/commits/{ref}", { owner, repo, ref }))
        .data.files ?? []) as ChangedFile[]
    const compareFiles = async (base: string, to: string) =>
      ((
        await octokit.request("GET /repos/{owner}/{repo}/compare/{basehead}", {
          owner,
          repo,
          basehead: `${base}...${to}`,
        })
      ).data.files ?? []) as ChangedFile[]

    let files: ChangedFile[]
    if (range.kind === "single") {
      files = await commitFiles(range.ref)
    } else if (range.kind === "compare") {
      files = await compareFiles(range.base, range.head)
    } else {
      const [root, after] = await Promise.all([
        commitFiles(range.root),
        compareFiles(range.root, range.head),
      ])
      files = [...root, ...after]
    }

    const { addedLines, truncated } = collectAddedLines(files)
    return {
      ...base,
      files: files.map((file) => ({ path: file.filename, changeType: toChangeType(file.status) })),
      addedLines,
      commits: history.data.length,
      truncated: truncated || files.length >= COMPARE_FILE_LIMIT,
      headSha: head,
      baseSha,
    }
  })
}

export type ErasedHistory = {
  commits: { sha: string; message: string; author: string | null }[]
  files: { path: string; changeType: ChangeType }[]
  addedLines: FileLines
  mergeBase: string
  truncated: boolean
}

// What a force push took out of a branch, read from the orphaned side of the
// rewrite.
export async function fetchErasedHistory(
  installationId: number,
  repoFullName: string,
  before: string,
  after: string,
): Promise<ErasedHistory | null> {
  return github("compare erased history", async () => {
    const response = await (await client(installationId)).request(
      "GET /repos/{owner}/{repo}/compare/{basehead}",
      { ...splitRepo(repoFullName), basehead: `${after}...${before}` },
    )
    const data = response.data
    if (data.commits.length === 0) return null

    const files = (data.files ?? []) as ChangedFile[]
    const { addedLines, truncated } = collectAddedLines(files)
    return {
      commits: data.commits.map((commit) => ({
        sha: commit.sha,
        message: commit.commit.message.split("\n")[0],
        author: commit.author?.login ?? commit.commit.author?.name ?? null,
      })),
      files: files.map((file) => ({ path: file.filename, changeType: toChangeType(file.status) })),
      addedLines,
      mergeBase: data.merge_base_commit.sha,
      truncated: truncated || files.length >= COMPARE_FILE_LIMIT,
    }
  })
}

export type UserInstallation = { id: number; account: string; accountType: "User" | "Organization" }

// Capped at one page: a user in more than 100 orgs is not a case this dashboard
// needs to serve, and paging here would run on every sign-in.
export async function fetchUserMemberships(userToken: string): Promise<{ org: string; role: "admin" | "member" }[]> {
  return github("list user memberships", async () => {
    const response = await new GitHubOctokit({ auth: userToken }).request("GET /user/memberships/orgs", {
      state: "active",
      per_page: 100,
    })
    return response.data.map((m) => ({ org: m.organization.login, role: m.role === "admin" ? "admin" : "member" }))
  })
}

// GitHub answers a failed refresh with 200 and an `error` field, so the caller
// validates the body rather than trusting the status.
export async function refreshUserToken(refreshToken: string): Promise<unknown> {
  return github("refresh user token", async () => {
    const response = await new GitHubOctokit().request("POST https://github.com/login/oauth/access_token", {
      headers: { accept: "application/json" },
      client_id: env().AUTH_GITHUB_ID,
      client_secret: env().AUTH_GITHUB_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    })
    return response.data
  })
}

// The installation token stays on this server; a runner only ever sees bytes.
export async function repoTarball(
  installationId: number,
  repo: string,
  sha: string,
  maxBytes: number,
): Promise<ReadableStream<Uint8Array>> {
  const response = await github("tarball", async () =>
    (await client(installationId)).request("GET /repos/{owner}/{repo}/tarball/{ref}", {
      ...splitRepo(repo),
      ref: sha,
      request: { parseSuccessResponseBody: false },
    }),
  )
  let sent = 0
  const cap = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      sent += chunk.byteLength
      if (sent > maxBytes) controller.error(new AppError("payload_too_large", "Tarball exceeds cap"))
      else controller.enqueue(chunk)
    },
  })
  return (response.data as unknown as ReadableStream<Uint8Array>).pipeThrough(cap)
}

export type AppDelivery = {
  id: number
  guid: string
  deliveredAt: Date
  redelivery: boolean
  statusCode: number
  event: string
  installationId: number | null
}

// The App's webhook delivery log, newest first, back to `since`.
export async function listAppDeliveries(since: Date): Promise<AppDelivery[]> {
  const octokit = githubApp().octokit
  const out: AppDelivery[] = []
  let cursor: string | undefined
  for (let page = 0; page < MAX_DELIVERY_PAGES; page++) {
    const response = await github("list deliveries", () =>
      octokit.request("GET /app/hook/deliveries", { per_page: 100, ...(cursor ? { cursor } : {}) }),
    )
    for (const row of response.data) {
      const deliveredAt = new Date(row.delivered_at)
      if (deliveredAt < since) return out
      out.push({
        id: Number(row.id),
        guid: row.guid,
        deliveredAt,
        redelivery: row.redelivery,
        statusCode: row.status_code,
        event: row.event,
        installationId: row.installation_id == null ? null : Number(row.installation_id),
      })
    }
    cursor = /[?&]cursor=([^&>]+)[^>]*>;\s*rel="next"/.exec(response.headers.link ?? "")?.[1]
    if (!cursor) break
  }
  return out
}

export async function redeliver(deliveryId: number): Promise<boolean> {
  try {
    await github("redeliver", () =>
      githubApp().octokit.request("POST /app/hook/deliveries/{delivery_id}/attempts", { delivery_id: deliveryId }),
    )
    return true
  } catch {
    return false
  }
}

// Installations of this App the signed-in user can reach. Read at sign-in so an
// install whose webhook never arrived is still found.
export async function fetchUserInstallations(userToken: string): Promise<UserInstallation[]> {
  return github("list user installations", async () => {
    const response = await new GitHubOctokit({ auth: userToken }).request("GET /user/installations", {
      per_page: MAX_USER_INSTALLATIONS,
    })
    return response.data.installations.map((i) => {
      const account = i.account as { login?: string; slug?: string; type?: string } | null
      return {
        id: Number(i.id),
        account: account?.login ?? account?.slug ?? "",
        accountType: account?.type === "Organization" ? ("Organization" as const) : ("User" as const),
      }
    })
  })
}

// The App's own record of one installation, and the repositories it covers.
export async function fetchInstallationDetails(
  installationId: number,
): Promise<{ account: string; accountType: "User" | "Organization"; suspended: boolean; repos: string[] }> {
  const installation = await github("get installation", () =>
    githubApp().octokit.request("GET /app/installations/{installation_id}", { installation_id: installationId }),
  )
  const account = installation.data.account as { login?: string; slug?: string; type?: string } | null
  const octokit = await client(installationId)
  const repos: string[] = []
  for (let page = 1; repos.length < MAX_REGISTERED_REPOS; page++) {
    const response = await github("list installation repositories", () =>
      octokit.request("GET /installation/repositories", { per_page: 100, page }),
    )
    repos.push(...response.data.repositories.map((r) => r.full_name))
    if (response.data.repositories.length < 100) break
  }
  return {
    account: account?.login ?? account?.slug ?? "",
    accountType: account?.type === "Organization" ? "Organization" : "User",
    suspended: Boolean(installation.data.suspended_at),
    repos: repos.slice(0, MAX_REGISTERED_REPOS),
  }
}

// False when the runner repository is gone or the App cannot write labels on it.
export async function createRunnerLabel(installationId: number, repo: string, name: string, description: string): Promise<boolean> {
  try {
    await github("create runner label", async () =>
      (await client(installationId)).request("POST /repos/{owner}/{repo}/labels", {
        ...splitRepo(repo),
        name,
        description,
        color: RUNNER_LABEL_COLOR,
      }),
    )
    return true
  } catch (error) {
    if (error instanceof AppError && (error.code === "not_found" || error.code === "forbidden")) return false
    throw error
  }
}

// The name holds a nonce, so it is never logged.
export async function deleteRunnerLabel(installationId: number, repo: string, name: string): Promise<void> {
  try {
    await github("delete runner label", async () =>
      (await client(installationId)).request("DELETE /repos/{owner}/{repo}/labels/{name}", { ...splitRepo(repo), name }),
    )
  } catch (error) {
    logger.warn("runner_label_delete_failed", { repo, code: error instanceof AppError ? error.code : "internal" })
  }
}

// The App's installation on one repository, read with the App JWT. Null when it is not installed there.
export async function repoInstallationId(repo: string): Promise<number | null> {
  try {
    const response = await github("get repository installation", () =>
      githubApp().octokit.request("GET /repos/{owner}/{repo}/installation", splitRepo(repo)),
    )
    return Number(response.data.id)
  } catch (error) {
    if (error instanceof AppError && error.code === "not_found") return null
    throw error
  }
}
