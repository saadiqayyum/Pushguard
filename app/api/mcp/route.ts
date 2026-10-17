import { NextResponse } from "next/server"
import { activeInstallation, asSystem, hit, mcpTokenByHash, repoRecord } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { bearerToken, hashMcpToken, repoAllowed } from "@/lib/mcp-auth"
import { serveMcp } from "@/lib/mcp-server"
import { withErrorHandler } from "@/lib/route"
import { readBody } from "@/lib/runner/guard"

export const maxDuration = 60

const MCP_BODY_MAX_BYTES = 64_000
const MCP_RATE_WINDOW_SECONDS = 60
const MCP_REQUESTS_PER_WINDOW = 60
const MCP_IP_REQUESTS_PER_WINDOW = 120

const limit = async (key: string, max: number) => {
  const { count, resetIn } = await hit(key, MCP_RATE_WINDOW_SECONDS)
  if (count > max) throw new AppError("rate_limited", "Too many requests", { retryAfterSeconds: resetIn })
}

// Machine-authenticated like the runner: a per-org bearer, then a repository
// that org's installation covers. Read-only tools, capped output.
export const POST = withErrorHandler("/api/mcp", async (request) =>
  asSystem(async () => {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    await limit(`mcp-ip:${ip}`, MCP_IP_REQUESTS_PER_WINDOW)

    const token = bearerToken(request.headers.get("authorization"))
    const owner = token ? await mcpTokenByHash(hashMcpToken(token)) : null
    if (!owner) throw new AppError("unauthorized", "Bad credentials")
    await limit(`mcp:${owner.id}`, MCP_REQUESTS_PER_WINDOW)

    const repo = new URL(request.url).searchParams.get("repo") ?? ""
    const installation = await activeInstallation(owner.org)
    if (!installation || !repoAllowed(owner.org, repo, await repoRecord(repo))) {
      throw new AppError("not_found", "No such repository for this token")
    }

    const body = await readBody(request, MCP_BODY_MAX_BYTES)
    logger.info("mcp_request", { org: owner.org, token: owner.id, repo })
    return serveMcp(request, body, installation.installationId, repo)
  }),
)

const notAllowed = () => NextResponse.json({ error: { code: "validation_failed", message: "POST only" } }, { status: 405 })
export const GET = notAllowed
export const DELETE = notAllowed
