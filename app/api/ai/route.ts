import { NextResponse } from "next/server"
import { memberScopes, requireUser } from "@/lib/auth"
import { db } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { withErrorHandler } from "@/lib/route"
import { hint, seal } from "@/lib/secret-box"
import { resolveTenant } from "@/lib/tenant"
import { addAiKeyBody, aiSettingsBody } from "@/schemas/api"

// The account's model credentials.
async function requireOrgSettings(): Promise<{ org: string; login: string }> {
  const user = await requireUser()
  const tenant = await resolveTenant(memberScopes(user))
  if (!tenant.current) throw new AppError("forbidden", "No Pushguard installation for this account")
  return { org: tenant.current.org, login: user.login }
}

// Add a key.
export const POST = withErrorHandler("/api/ai", async (request) => {
  const body = addAiKeyBody.parse(await request.json())
  const { org, login } = await requireOrgSettings()
  const existing = await db.installations().findOne({ org })
  if ((existing?.aiKeys ?? []).some((entry) => entry.label === body.label)) {
    throw new AppError("validation_failed", `A key named "${body.label}" already exists`)
  }

  const entry = {
    id: crypto.randomUUID(),
    label: body.label,
    provider: body.provider,
    key: seal(body.apiKey),
    keyHint: hint(body.apiKey),
    model: body.model,
    effort: body.effort,
    addedBy: login,
    addedAt: new Date(),
  }

  await db.installations().updateOne(
    { org },
    {
      $push: { aiKeys: entry },
      $set: {
        updatedAt: new Date(),
        ...(existing?.aiDefaultKey ? {} : { aiDefaultKey: entry.id }),
      },
    },
  )
  logger.info("ai_key_added", { org, by: login, label: body.label, provider: body.provider })

  return NextResponse.json(
    {
      data: {
        id: entry.id,
        label: entry.label,
        provider: entry.provider,
        keyHint: entry.keyHint,
        model: entry.model,
        effort: entry.effort,
      },
    },
    { status: 201 },
  )
})

// Change which key runs when a rule does not name one.
export const PATCH = withErrorHandler("/api/ai", async (request) => {
  const body = aiSettingsBody.parse(await request.json())
  const { org, login } = await requireOrgSettings()
  const existing = await db.installations().findOne({ org })
  const keys = existing?.aiKeys ?? []
  if (!keys.some((entry) => entry.id === body.defaultKey)) {
    throw new AppError("not_found", "No such key")
  }

  await db.installations().updateOne(
    { org },
    { $set: { aiDefaultKey: body.defaultKey, updatedAt: new Date() } },
  )
  logger.info("ai_default_key_set", { org, by: login })
  return NextResponse.json({ data: { defaultKey: body.defaultKey } })
})

// Remove one key.
export const DELETE = withErrorHandler("/api/ai", async (request) => {
  const id = new URL(request.url).searchParams.get("id")
  if (!id) throw new AppError("validation_failed", "Which key?")
  const { org, login } = await requireOrgSettings()
  const existing = await db.installations().findOne({ org })
  const remaining = (existing?.aiKeys ?? []).filter((entry) => entry.id !== id)

  await db.installations().updateOne(
    { org },
    {
      $set: {
        aiKeys: remaining,
        ...(existing?.aiDefaultKey === id ? { aiDefaultKey: remaining[0]?.id } : {}),
        updatedAt: new Date(),
      },
    },
  )
  logger.info("ai_key_removed", { org, by: login, remaining: remaining.length })
  return NextResponse.json({ data: null })
})
