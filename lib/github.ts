import { App } from "@octokit/app"
import { Octokit } from "@octokit/core"
import { env } from "@/lib/env"
import { AppError, type ErrorCode } from "@/lib/errors"
import { GITHUB_SEARCH_MAX_RESULTS, SCAN_COMMIT_WINDOW, type Paging } from "@/lib/paging"
import type { ChangeType } from "@/schemas/rule"

const DIFF_MAX_BYTES = 50_000

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

// GitHub's status code is the only thing that tells "you may not see this" apart
// from "GitHub is having a bad day", and callers need that difference: one is
// answered by installing the app, the other by waiting. Octokit puts it on the
// thrown error, so map it here rather than letting every caller re-inspect.
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

// The one search that legitimately runs on an installation token: it happens
// during webhook processing with no user in the request, is scoped to a single
// repository the installation owns, and returns a boolean. Nothing about it
// reaches a reader, so there is no access to narrow.
export async function findOpenAlertBySha(installationId: number, targetRepo: string, sha: string): Promise<boolean> {
  return github("search issues", async () => {
    const response = await (await client(installationId)).request("GET /search/issues", {
      q: `repo:${targetRepo} is:issue is:open "${sha}"`,
    })
    return response.data.total_count > 0
  })
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

/**
 * Everyone who can read a repository, as GitHub computes it, org role, team
 * grants and direct collaboration already flattened into one list. Called from
 * webhooks and the reconciliation job, never from a request the frontend makes.
 */
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
          // Triage is enough to close an issue; pull alone is not. Read access
          // lets you see an alert, and closing one is a change to the record.
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

/**
 * Branches and default branch on the installation's own credentials, for the
 * sync path. `listRepoBranches` above is the user-token variant; this one runs
 * from webhooks and the reconciliation job, where there is no user.
 */
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

/** Members of one team, for the membership and team webhooks. */
export async function listTeamMembers(installationId: number, org: string, teamSlug: string): Promise<string[]> {
  return github("list team members", async () => {
    const response = await (await client(installationId)).request(
      "GET /orgs/{org}/teams/{team_slug}/members",
      { org, team_slug: teamSlug, per_page: 100 },
    )
    return response.data.map((user) => user.login)
  })
}

/** Repositories one team can reach, for the same events. */
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

// Branch names are a read of the repository, so this runs on the user's token
// like every other read they can see. The caller checks the repository is in
// their accessible list first; this only enumerates.
export async function listRepoBranches(
  userToken: string,
  repoFullName: string,
  limit = 100,
): Promise<RepoBranches> {
  return github("list branches", async () => {
    const octokit = new Octokit({ auth: userToken })
    const { owner, repo } = splitRepo(repoFullName)
    const [meta, branches] = await Promise.all([
      octokit.request("GET /repos/{owner}/{repo}", { owner, repo }),
      octokit.request("GET /repos/{owner}/{repo}/branches", { owner, repo, per_page: limit }),
    ])
    const names = branches.data.map((branch) => branch.name)
    const defaultBranch = meta.data.default_branch
    // Default first: it is what a scan uses when nothing is chosen, so it should
    // be what the picker opens on rather than whatever sorts first.
    return {
      defaultBranch,
      branches: [defaultBranch, ...names.filter((name) => name !== defaultBranch)],
    }
  })
}

export type CreatedIssue = { html_url: string; number: number }

export async function createAlertIssue(
  installationId: number,
  repo: string,
  title: string,
  body: string,
  labels: string[],
  // GitHub silently ignores assignees without push access to the repo, and
  // cannot assign a team. So this is best-effort, never a reason to fail.
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

// Alerts live in whichever repo triggered them, so the feed is an account-wide
// search for the label rather than a single-repo issue list.
//
// Searched with the **user's** token, never the installation's. An installation
// token sees every repository the app was granted, so searching with it returned
// alerts, titles, repository names, issue links, from private repositories the
// reader has no access to on GitHub. The user's token returns only what they can
// already see, which also keeps `total` and paging honest: filtering the results
// afterwards would have shown "25 of 100" above three rows.
export async function listAlertIssues(
  userToken: string,
  account: string,
  accountType: "User" | "Organization",
  paging: Paging,
): Promise<AlertPage> {
  return github("search alert issues", async () => {
    const scope = accountType === "Organization" ? "org" : "user"
    const response = await new Octokit({ auth: userToken }).request("GET /search/issues", {
      q: `${scope}:${account} is:issue label:pushguard`,
      sort: "created",
      order: "desc",
      per_page: paging.perPage,
      page: paging.page,
    })
    const total = Math.min(response.data.total_count, GITHUB_SEARCH_MAX_RESULTS)
    const issues = response.data.items.map((issue) => ({
      number: issue.number,
      // repository_url is .../repos/{owner}/{repo}
      repo: issue.repository_url.split("/repos/")[1] ?? "",
      title: issue.title,
      html_url: issue.html_url,
      state: issue.state,
      created_at: issue.created_at,
      labels: issue.labels.map((label) => ({ name: typeof label === "string" ? label : label.name ?? "" })),
    }))
    return { issues, total, hasMore: paging.skip + issues.length < total }
  })
}

// Direct lookup: is this app installed on the given user/org? Lets the
// dashboard self-register installations even when the installation webhook
// was missed.
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
  /** Newest commit read. What a file link should point at. */
  headSha: string
  /** Oldest commit in the window; null when the repo has a single commit. */
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

// Recent history for one repository, shaped like the push payload the engine
// already understands. Three requests: metadata, the commit window, and one
// compare across it.
export async function fetchRepoSnapshot(
  repoFullName: string,
  installationId: number,
  // A ref that does not exist 404s on the commits call below, which surfaces as
  // not_found rather than an empty scan that looks like a clean one.
  requestedBranch?: string,
): Promise<RepoSnapshot> {
  return github("read repository", async () => {
    const octokit = await client(installationId)
    const { owner, repo } = splitRepo(repoFullName)

    // Only asked when the branch is unknown. A caller that already holds the
    // default branch. Because a webhook told us, saves a request per
    // repository, which on a twenty-repository scan is twenty.
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

    // A repository with a single commit has nothing to compare against, so read
    // that commit directly rather than reporting an empty scan.
    const head = history.data[0].sha
    const baseSha = history.data.length === 1 ? null : history.data.at(-1)!.sha
    const changed =
      history.data.length === 1
        ? (await octokit.request("GET /repos/{owner}/{repo}/commits/{ref}", { owner, repo, ref: head })).data.files
        : (
            await octokit.request("GET /repos/{owner}/{repo}/compare/{basehead}", {
              owner,
              repo,
              basehead: `${baseSha}...${head}`,
            })
          ).data.files

    const files = (changed ?? []) as ChangedFile[]
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

// The authorization boundary for every scan.
//
// These two are deliberately called with the *user's* token, never an
// installation token. An installation token sees every repository the app was
// granted, which is a superset of what any one member may read, using it to
// decide what someone can scan is how a junior in a 500-person org ends up
// reading the payroll repo's diffs. GitHub already computes the intersection;
// asking it is both simpler and correct.

export type UserInstallation = { id: number; account: string; accountType: "User" | "Organization" }

/** Installations of this app that the signed-in user can actually see. */
export async function listUserInstallations(userToken: string): Promise<UserInstallation[]> {
  return github("list user installations", async () => {
    const response = await new Octokit({ auth: userToken }).request("GET /user/installations", {
      per_page: 100,
    })
    return response.data.installations.map((installation) => ({
      id: installation.id,
      account:
        (installation.account && "login" in installation.account
          ? installation.account.login
          : installation.account?.slug) ?? "",
      accountType:
        installation.account && "type" in installation.account && installation.account.type === "Organization"
          ? ("Organization" as const)
          : ("User" as const),
    }))
  })
}

/**
 * Repositories in one installation that this user has explicit read access to.
 * GitHub's own words: repositories "the authenticated user has explicit
 * permission (:read, :write, or :admin) to access". This list is the ACL. A
 * repository absent from it may not be scanned, whatever the request asked for.
 */
export async function listUserInstallationRepos(
  userToken: string,
  installationId: number,
  limit: number,
): Promise<string[]> {
  return github("list user installation repositories", async () => {
    const octokit = new Octokit({ auth: userToken })
    const repos: string[] = []
    for (let page = 1; repos.length < limit; page++) {
      const response = await octokit.request("GET /user/installations/{installation_id}/repositories", {
        installation_id: installationId,
        per_page: 100,
        page,
      })
      repos.push(...response.data.repositories.filter((r) => !r.archived).map((r) => r.full_name))
      if (response.data.repositories.length < 100) break
    }
    return repos.slice(0, limit)
  })
}

// Capped at one page: a user in more than 100 orgs is not a case this dashboard
// needs to serve, and paging here would run on every sign-in.
export async function fetchUserOrgs(userToken: string): Promise<string[]> {
  return github("list user orgs", async () => {
    const response = await new Octokit({ auth: userToken }).request("GET /user/orgs", { per_page: 100 })
    return response.data.map((org) => org.login)
  })
}
