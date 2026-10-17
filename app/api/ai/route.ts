import { activeInstallation, countAiKeys, deleteAiKey, insertAiKey, publicAiKeys, updateInstallation } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { respond, userRoute } from "@/lib/route"
import { hint, seal } from "@/lib/secret-box"
import { requireAdmin } from "@/lib/tenant"
import { addAiKeyBody, aiSettingsBody, MAX_AI_KEYS_PER_ORG } from "@/schemas/api"
import { aiKeyOut, defaultKeyOut, nothingOut } from "@/schemas/output"

export const POST = userRoute("/api/ai", async (request) => {
  const body = addAiKeyBody.parse(await request.json())
  const { org, login } = await requireAdmin()

  const keys = await publicAiKeys(org)
  if (keys.length >= MAX_AI_KEYS_PER_ORG) {
    throw new AppError("validation_failed", `At most ${MAX_AI_KEYS_PER_ORG} keys per organization`)
  }
  if (keys.some((key) => key.label === body.label)) {
    throw new AppError("validation_failed", `A key named "${body.label}" already exists`)
  }

  const key = {
    id: crypto.randomUUID(),
    org,
    label: body.label,
    provider: body.provider,
    keyHint: hint(body.apiKey),
    model: body.model,
    effort: body.effort,
    baseUrl: body.baseUrl ?? null,
    maxOutputTokens: body.maxOutputTokens ?? null,
    thinkingBudget: body.thinkingBudget ?? null,
    timeoutMs: body.timeoutMs ?? null,
    ...seal(body.apiKey),
    addedBy: login,
    addedAt: new Date(),
  }
  await insertAiKey(key)
  if (!(await activeInstallation(org))?.aiDefaultKey) await updateInstallation(org, { aiDefaultKey: key.id })
  logger.info("ai_key_added", { org, by: login, provider: body.provider })

  return respond(aiKeyOut, { ...key, baseUrl: key.baseUrl ?? undefined }, { status: 201 })
})

export const PATCH = userRoute("/api/ai", async (request) => {
  const { defaultKey } = aiSettingsBody.parse(await request.json())
  const { org, login } = await requireAdmin()
  if (!(await publicAiKeys(org)).some((key) => key.id === defaultKey)) throw new AppError("not_found", "No such key")

  await updateInstallation(org, { aiDefaultKey: defaultKey })
  logger.info("ai_default_key_set", { org, by: login })
  return respond(defaultKeyOut, { defaultKey })
})

export const DELETE = userRoute("/api/ai", async (request) => {
  const id = new URL(request.url).searchParams.get("id")
  if (!id) throw new AppError("validation_failed", "Which key?")
  const { org, login } = await requireAdmin()

  if (!(await deleteAiKey(org, id))) throw new AppError("not_found", "No such key")
  if ((await activeInstallation(org))?.aiDefaultKey === id) {
    const [next] = await publicAiKeys(org)
    await updateInstallation(org, { aiDefaultKey: next?.id ?? null })
  }
  logger.info("ai_key_removed", { org, by: login, remaining: await countAiKeys(org) })
  return respond(nothingOut, null)
})
