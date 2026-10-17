import { githubToken, requireUser } from "@/lib/auth"
import {
  accessibleRepos,
  activeInstallations,
  canReadRepo,
  insertScan,
  installationById,
  queueScan,
  repoRecord,
  scansSince,
  type ScanDoc,
} from "@/lib/db"
import { ownerOf } from "@/lib/finding"
import { AppError } from "@/lib/errors"
import { type UserInstallation } from "@/lib/github"
import { logger } from "@/lib/logger"

export const SCAN_LIMITS = { perDay: 25, repos: 20 } as const

// Who is asking, and the token that decides what they may read.
export type Requester = { login: string; token: string }

export async function resolveRequester(): Promise<Requester> {
  const { login } = await requireUser()
  const token = await githubToken()
  if (!token) throw new AppError("unauthorized", "Your GitHub session expired. Sign in again.")
  return { login, token }
}

// What the picker may offer, read entirely from the projection.
export async function scanTargets(
  requester: Requester,
): Promise<{ installation: UserInstallation; repos: string[] }[]> {
  const repos = await accessibleRepos(requester.login)
  if (repos.length === 0) return []

  const orgs = [...new Set(repos.map((repo) => ownerOf(repo)))]
  const active = await activeInstallations(orgs)

  return active.map((installation) => ({
    installation: {
      id: installation.installationId,
      account: installation.org,
      accountType: installation.accountType ?? "User",
    },
    repos: repos.filter((repo) => ownerOf(repo) === installation.org),
  }))
}

// Branches of one repository, refused unless GitHub lists that repository for
// this user.
export async function branchesFor(
  requester: Requester,
  installationId: number,
  repo: string,
): Promise<{ branches: string[]; defaultBranch: string }> {
  if (!(await canReadRepo(requester.login, repo))) {
    throw new AppError("forbidden", "You do not have access to that repository")
  }

  const stored = await repoRecord(repo)
  if (!stored) return { branches: [], defaultBranch: "" }
  return { branches: stored.branches, defaultBranch: stored.defaultBranch }
}

async function usedToday(owner: string): Promise<number> {
  return scansSince(owner, new Date(Date.now() - 24 * 60 * 60 * 1000))
}

export type ScanRequest = { installationId: number; repo?: string; branch?: string; aiKey?: string }

// Everything that can fail cheaply fails here: the quota, the concurrency rule,
// and, the one that matters, whether this user may read what they asked for.
export async function enqueueScan(requester: Requester, request: ScanRequest): Promise<ScanDoc> {
  if ((await usedToday(requester.login)) >= SCAN_LIMITS.perDay) {
    throw new AppError("rate_limited", `Scans are limited to ${SCAN_LIMITS.perDay} a day.`)
  }

  const installation = await installationById(request.installationId)
  if (!installation) throw new AppError("not_found", "No such installation")

  const accessible = await accessibleRepos(requester.login, installation.installationId)
  if (accessible.length === 0) {
    throw new AppError(
      "install_required",
      `Pushguard covers no repositories you can read in ${installation.org}.`,
    )
  }

  if (request.repo && !accessible.includes(request.repo)) {
    throw new AppError("forbidden", "You do not have access to that repository")
  }

  const repos = request.repo ? [request.repo] : accessible.slice(0, SCAN_LIMITS.repos)
  let doc: ScanDoc
  try {
    doc = await insertScan({
      id: crypto.randomUUID(),
      owner: requester.login,
      target: request.repo ?? installation.org,
      branch: request.branch && request.repo ? request.branch : null,
      scope: request.repo ? "repo" : "org",
      aiKey: request.aiKey ?? null,
      status: "queued",
      active: true,
      installationId: installation.installationId,
      account: installation.org,
      repos,
      skippedRepos: request.repo ? 0 : Math.max(0, accessible.length - SCAN_LIMITS.repos),
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("rate_limited", "A scan is already running. Wait for it to finish.")
    }
    throw error
  }
  await queueScan(doc.id)

  logger.info("scan_queued", { id: doc.id, target: doc.target, repos: doc.repos.length })
  return doc
}

// Drizzle wraps the driver error, so the SQLSTATE may sit one level down.
function isUniqueViolation(error: unknown): boolean {
  const { code, cause } = (error ?? {}) as { code?: string; cause?: { code?: string } }
  return code === "23505" || cause?.code === "23505"
}

