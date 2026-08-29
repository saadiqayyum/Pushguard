import { App } from "@octokit/app"
import { Octokit } from "@octokit/core"
import { env } from "@/lib/env"
import { AppError } from "@/lib/errors"
import { GITHUB_SEARCH_MAX_RESULTS, type Paging } from "@/lib/paging"

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

async function github<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    throw new AppError("upstream_github", `GitHub ${operation} failed`, { cause: error })
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

export type CreatedIssue = { html_url: string; number: number }

export async function createAlertIssue(
  installationId: number,
  alertsRepo: string,
  title: string,
  body: string,
  labels: string[],
  // GitHub silently ignores assignees without push access to the repo, and
  // cannot assign a team — so this is best-effort, never a reason to fail.
  assignees: string[] = [],
): Promise<CreatedIssue> {
  return github("create issue", async () => {
    const response = await (await client(installationId)).request("POST /repos/{owner}/{repo}/issues", {
      ...splitRepo(alertsRepo),
      title,
      body,
      labels,
      assignees,
    })
    return { html_url: response.data.html_url, number: response.data.number }
  })
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
// search for the label rather than a single-repo issue list. Search only ever
// returns repos this installation can see.
export async function listAlertIssues(
  installationId: number,
  account: string,
  accountType: "User" | "Organization",
  paging: Paging,
): Promise<AlertPage> {
  return github("search alert issues", async () => {
    const scope = accountType === "Organization" ? "org" : "user"
    const response = await (await client(installationId)).request("GET /search/issues", {
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
// members:read org permission, which only exists on organization installs —
// a personal account has no teams, so this never calls GitHub for one.
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

// Capped at one page: a user in more than 100 orgs is not a case this dashboard
// needs to serve, and paging here would run on every sign-in.
export async function fetchUserOrgs(userToken: string): Promise<string[]> {
  return github("list user orgs", async () => {
    const response = await new Octokit({ auth: userToken }).request("GET /user/orgs", { per_page: 100 })
    return response.data.map((org) => org.login)
  })
}
