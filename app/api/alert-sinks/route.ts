import { z } from "zod"
import { countSinks, insertSink, sinksFor } from "@/lib/db/alert-sinks"
import { AppError } from "@/lib/errors"
import { logger } from "@/lib/logger"
import { respond, userRoute } from "@/lib/route"
import { hint, seal } from "@/lib/secret-box"
import { requireAdmin } from "@/lib/tenant"
import { createSinkBody, MAX_SINKS_PER_ORG, sinkView } from "@/schemas/alert-sink"

const toView = (sink: { id: string; label: string; host: string; hint: string; createdAt: Date }) => ({
  ...sink,
  createdAt: sink.createdAt.toISOString(),
})

// Capped at MAX_SINKS_PER_ORG on write, so the list needs no paging.
export const GET = userRoute("/api/alert-sinks", async () => {
  const { org } = await requireAdmin()
  return respond(z.array(sinkView), (await sinksFor(org)).map(toView))
})

export const POST = userRoute("/api/alert-sinks", async (request) => {
  const body = createSinkBody.parse(await request.json())
  const { org, login } = await requireAdmin()
  if ((await countSinks(org)) >= MAX_SINKS_PER_ORG) {
    throw new AppError("validation_failed", `At most ${MAX_SINKS_PER_ORG} destinations per organization`)
  }

  const sink = {
    id: crypto.randomUUID(),
    org,
    label: body.label,
    host: new URL(body.url).hostname,
    hint: hint(body.url),
    ...seal(body.url),
    createdBy: login,
    createdAt: new Date(),
  }
  await insertSink(sink)
  logger.info("alert_sink_added", { org, by: login, host: sink.host })
  return respond(sinkView, toView(sink), { status: 201 })
})
