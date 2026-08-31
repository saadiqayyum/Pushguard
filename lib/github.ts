import { App } from "@octokit/app"
import { Octokit } from "@octokit/core"
import { env } from "@/lib/env"
import { AppError, type ErrorCode } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { SCAN_COMMIT_WINDOW } from "@/lib/paging"
import { scanRange } from "@/lib/scan-range"
import type { ChangeType } from "@/schemas/rule"

// Forty times the old 50 KB. The cap exists because a diff has to be held in.
const DIFF_MAX_BYTES = 2_000_000

// The budget, for anything that has to explain it to a reader.
export const DIFF_READ_BUDGET = "2 MB"

let app: App | null = null

function githubApp(): App {
  app ??= new App({
    appId: env().GITHUB_APP_ID,
    privateKey: env().GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n"),
  })
  return app
}

// Octokit caches installation tokens internally per installation.
function client(installationId: number): Promise<Octokit> {
  return githubApp().getInstallationOctokit(installationId)
}

// GitHub's status code is the only thing that tells "you may not see this" apart.
function codeFor(status: number | undefined): ErrorCode {
  if (status === 404) return "not_found"
  if (status === 401 || status === 403) return "forbidden"
  if (status === 429) return "rate_limited"
  return "upstream_github"
}

async function github<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    const status = (error as { status?: number }).status
    throw new AppError(codeFor(status), `GitHub ${operation} failed`, { cause: error })
  }
}

function splitRepo(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split("/")
  return { owner, repo }
}

export type CompareResult = {
  addedLines: string[]
  truncated: boolean
}

export async function fetchAddedLines(
  installationId: number,
  repoFullName: string,
  before: string,
  after: string,
): Promise<CompareResult> {
  const diff = await github("compare", async () => {
    const response = await (await client(installationId)).request(
      "GET /repos/{owner}/{repo}/compare/{basehead}",
      { ...splitRepo(repoFullName), basehead: `${before}...${after}`, mediaType: { format: "diff" } },
    )
    return response.data as unknown as string
  })

  const truncated = diff.length > DIFF_MAX_BYTES
  const addedLines = diff
    .slice(0, DIFF_MAX_BYTES)
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1))

  return { addedLines, truncated }
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

// Every path in the repository at one commit, in a single request.
export async function fetchRepoTree(
  installationId: number,
  repoFullName: string,
  ref: string,
): Promise<RepoTree> {
  return github("read tree", async () => {
    const response = await (await client(installationId)).request(
      "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
      { ...splitRepo(repoFullName), tree_sha: ref, recursive: "1" },
    )
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
  if (paths.length === 0) return { files, remaining: null }

  return github("read blobs", async () => {
    const octokit = await client(installationId)
    const { owner, repo } = splitRepo(repoFullName)
    const wanted = paths.slice(0, BLOB_BATCH)

    const declarations = wanted.map((_, i) => `$e${i}: String!`).join(", ")
    const selections = wanted
      .map((_, i) => `f${i}: object(expression: $e${i}) { ... on Blob { text isTruncated } }`)
      .join("\n      ")
    const variables: Record<string, string> = { owner, repo }
    wanted.forEach((path, i) => {
      variables[`e${i}`] = `${sha}:${path}`
    })

    const result = await octokit.graphql<{
      rateLimit?: { remaining: number }
      repository: Record<string, { text?: string | null; isTruncated?: boolean } | null>
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
      if (blob?.text && !blob.isTruncated) files.set(path, blob.text)
    })

    return { files, remaining: result.rateLimit?.remaining ?? null }
  })
}

export type CompareFile = {
  path: string
  status: string
  additions: number
  deletions: number
  patch?: string
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
    }[]
    return {
      files: raw.map((file) => ({
        path: file.filename,
        status: file.status,
        additions: file.additions ?? 0,
        deletions: file.deletions ?? 0,
        patch: file.patch,
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
  vulnerabilities: { severity: string; summary: string; advisory: string }[]
}

// Packages this range added, with any known advisories against them.
// Null when the repository has no dependency graph enabled, which 404s.
export async function fetchDependencyChanges(
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
    return rows
      .filter((row) => row.change_type === "added" && (row.vulnerabilities?.length ?? 0) > 0)
      .map((row) => ({
        name: row.name,
        version: row.version,
        ecosystem: row.ecosystem,
        manifest: row.manifest,
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

export type InstallationRepo = { fullName: string; private: boolean; ownerType: string }

// Hard ceiling on how many repos one installation contributes. A very large org
// would otherwise page forever and bloat the installation document.
const MAX_INSTALLATION_REPOS = 500

// Used once per installation to backfill the repo list when the installation
// webhook predates repo tracking. Steady state is webhook-driven.
export async function listInstallationRepos(installationId: number): Promise<InstallationRepo[]> {
  return github("list installation repositories", async () => {
    const octokit = await client(installationId)
    const repos: InstallationRepo[] = []
    for (let page = 1; page <= MAX_INSTALLATION_REPOS / 100; page++) {
      const response = await octokit.request("GET /installation/repositories", { per_page: 100, page })
      repos.push(
        ...response.data.repositories.map((repo) => ({
          fullName: repo.full_name,
          private: repo.private,
          ownerType: repo.owner.type,
        })),
      )
      if (response.data.repositories.length < 100) break
    }
    return repos
  })
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

// Branches and default branch on the installation's own credentials, for the.
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

// Direct lookup: is this app installed on the given user/org? Lets the.
export async function findInstallationForAccount(account: string): Promise<number | null> {
  const octokit = githubApp().octokit
  for (const route of ["GET /users/{account}/installation", "GET /orgs/{account}/installation"] as const) {
    try {
      const response = await octokit.request(route, { account, org: account, username: account })
      return response.data.id
    } catch {
      continue
    }
  }
  return null
}

// Team slugs, as `org/team`, ready to paste into an @mention. Needs the
// members:read org permission, which only exists on organization installs, // a personal account has no teams, so this never calls GitHub for one.
export async function listInstallationTeams(
  installationId: number,
  account: string,
  accountType: "User" | "Organization",
): Promise<string[]> {
  if (accountType !== "Organization") return []
  return github("list teams", async () => {
    const response = await (await client(installationId)).request("GET /orgs/{org}/teams", {
      org: account,
      per_page: 100,
    })
    return response.data.map((team) => `${account}/${team.slug}`)
  })
}

// GitHub's compare endpoint stops listing files at 300.
const COMPARE_FILE_LIMIT = 300

export type RepoSnapshot = {
  repo: string
  branch: string
  files: { path: string; changeType: ChangeType }[]
  addedLines: string[]
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

function collectAddedLines(files: ChangedFile[]): { addedLines: string[]; truncated: boolean } {
  const addedLines: string[] = []
  let budget = DIFF_MAX_BYTES
  for (const file of files) {
    if (!file.patch) continue
    if (budget <= 0) return { addedLines, truncated: true }
    const slice = file.patch.slice(0, budget)
    budget -= slice.length
    for (const line of slice.split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++")) addedLines.push(line.slice(1))
    }
  }
  return { addedLines, truncated: budget <= 0 }
}

// Recent history for one repository, shaped like the push payload the engine.
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

    const history = await octokit.request("GET /repos/{owner}/{repo}/commits", {
      owner,
      repo,
      sha: branch,
      per_page: SCAN_COMMIT_WINDOW,
    })
    if (history.data.length === 0) {
      return { ...base, files: [], addedLines: [], commits: 0, truncated: false, headSha: "", baseSha: null }
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
  addedLines: string[]
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

// The authorization boundary for every scan.
//

export type UserInstallation = { id: number; account: string; accountType: "User" | "Organization" }

// Capped at one page: a user in more than 100 orgs is not a case this dashboard
// needs to serve, and paging here would run on every sign-in.
export async function fetchUserOrgs(userToken: string): Promise<string[]> {
  return github("list user orgs", async () => {
    const response = await new Octokit({ auth: userToken }).request("GET /user/orgs", { per_page: 100 })
    return response.data.map((org) => org.login)
  })
}
