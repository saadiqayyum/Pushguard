import { publicAiKeys, replaceAiKey, updateAiKey } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { respond, userRoute } from "@/lib/route"
import { hint, seal } from "@/lib/secret-box"
import { requireAdmin } from "@/lib/tenant"
import { editAiKeyBody } from "@/schemas/api"
import { aiKeyOut } from "@/schemas/output"

export const PATCH = userRoute("/api/ai/[id]", async (request, { params }) => {
  const { id } = await params
  const body = editAiKeyBody.parse(await request.json())
  const { login, org } = await requireAdmin()

  const keys = await publicAiKeys(org)
  const current = keys.find((key) => key.id === id)
  if (!current) throw new AppError("not_found", "No such key")
  if (keys.some((key) => key.id !== id && key.label === body.label)) {
    throw new AppError("validation_failed", `A key named "${body.label}" already exists`)
  }
  if (body.provider !== current.provider && !body.apiKey) {
    throw new AppError("validation_failed", "Changing the provider needs the new provider's key")
  }

  const fields = {
    label: body.label,
    model: body.model,
    effort: body.effort,
    baseUrl: body.baseUrl ?? null,
    maxOutputTokens: body.maxOutputTokens ?? null,
    thinkingBudget: body.thinkingBudget ?? null,
    timeoutMs: body.timeoutMs ?? null,
  }
  const keyHint = body.apiKey ? hint(body.apiKey) : current.keyHint
  if (body.apiKey) {
    await replaceAiKey({
      id,
      org,
      ...fields,
      provider: body.provider,
      keyHint,
      ...seal(body.apiKey),
      addedBy: login,
      addedAt: new Date(),
    })
  } else {
    await updateAiKey(org, id, fields)
  }
  logger.info("ai_key_edited", { org, by: login, replaced: Boolean(body.apiKey) })

  return respond(aiKeyOut, { id, ...fields, provider: body.provider, keyHint, baseUrl: fields.baseUrl ?? undefined })
})
