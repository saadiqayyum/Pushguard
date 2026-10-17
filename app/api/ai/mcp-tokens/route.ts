import { z } from "zod"
import { deleteMcpToken, insertMcpToken, publicMcpTokens } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { newMcpToken } from "@/lib/mcp-auth"
import { respond, userRoute } from "@/lib/route"
import { requireAdmin } from "@/lib/tenant"
import { createMcpTokenBody, MAX_MCP_TOKENS_PER_ORG } from "@/schemas/api"
import { mcpTokenCreatedOut, nothingOut } from "@/schemas/output"

export const POST = userRoute("/api/ai/mcp-tokens", async (request) => {
  const { label } = createMcpTokenBody.parse(await request.json())
  const { org, login } = await requireAdmin()

  if ((await publicMcpTokens(org)).length >= MAX_MCP_TOKENS_PER_ORG) {
    throw new AppError("validation_failed", `At most ${MAX_MCP_TOKENS_PER_ORG} MCP tokens per organization`)
  }
  const { token, hash, hint } = newMcpToken()
  const id = crypto.randomUUID()
  const createdAt = new Date()
  await insertMcpToken({ id, org, label, hash, hint, createdBy: login, createdAt })
  logger.info("mcp_token_created", { org, by: login })

  return respond(
    mcpTokenCreatedOut,
    { id, label, hint, createdAt: createdAt.toISOString(), lastUsedAt: null, token },
    { status: 201 },
  )
})

export const DELETE = userRoute("/api/ai/mcp-tokens", async (request) => {
  const id = z.string().uuid().parse(new URL(request.url).searchParams.get("id"))
  const { org, login } = await requireAdmin()

  if (!(await deleteMcpToken(org, id))) throw new AppError("not_found", "No such token")
  logger.info("mcp_token_revoked", { org, by: login })
  return respond(nothingOut, null)
})
