import { NextResponse } from "next/server"
import { memberScopes, requireUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { withErrorHandler } from "@/lib/route"
import { hint, seal } from "@/lib/secret-box"
import { resolveTenant } from "@/lib/tenant"
import { editAiKeyBody } from "@/schemas/api"

// Edit one stored key.
export const PATCH = withErrorHandler("/api/ai/[id]", async (request, { params }) => {
  const { id } = await params
  const body = editAiKeyBody.parse(await request.json())

  const user = await requireUser()
  const tenant = await resolveTenant(memberScopes(user))
  if (!tenant.current) throw new AppError("forbidden", "No Pushguard installation for this account")
  const org = tenant.current.org

  const existing = await db.installations().findOne({ org })
  const key = (existing?.aiKeys ?? []).find((entry) => entry.id === id)
  if (!key) throw new AppError("not_found", "No such key")

  if ((existing?.aiKeys ?? []).some((entry) => entry.id !== id && entry.label === body.label)) {
    throw new AppError("validation_failed", `A key named "${body.label}" already exists`)
  }

  const updated = {
    ...key,
    label: body.label,
    provider: body.provider,
    model: body.model,
    effort: body.effort,
    ...(body.apiKey ? { key: seal(body.apiKey), keyHint: hint(body.apiKey) } : {}),
  }

  await db.installations().updateOne(
    { org, "aiKeys.id": id },
    { $set: { "aiKeys.$": updated, updatedAt: new Date() } },
  )
  logger.info("ai_key_edited", { org, by: user.login, replaced: Boolean(body.apiKey) })

  return NextResponse.json({
    data: {
      id: updated.id,
      label: updated.label,
      provider: updated.provider,
      keyHint: updated.keyHint,
      model: updated.model,
      effort: updated.effort,
    },
  })
})
