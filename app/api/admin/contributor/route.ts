import { readAttackDoc } from "@/lib/contributor/docs"
import { platformModel } from "@/lib/contributor/model"
import { asSystem, enqueueJob, recordPlatformAudit } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { adminRoute } from "@/lib/platform/auth"
import { respond } from "@/lib/route"
import { contributorRequestBody, queuedOut } from "@/schemas/admin"

export const POST = adminRoute("/api/admin/contributor", async (request, _context, admin) => {
  const input = contributorRequestBody.parse(await request.json())
  if (!platformModel()) throw new AppError("validation_failed", "Set PLATFORM_AI_KEY to turn on the AI security expert")
  const job =
    input.source === "incident"
      ? { ...input, requestedBy: admin.login }
      : { source: "doc" as const, title: input.docPath, text: await readAttackDoc(input.docPath), urls: [], docPath: input.docPath, requestedBy: admin.login }
  await asSystem(async () => {
    await enqueueJob({ type: "contributor", ...job })
    await recordPlatformAudit({ actor: admin.login, action: "contributor_requested", target: `contributor:${job.source}`, details: { title: job.title } })
  })
  return respond(queuedOut, { queued: true })
})
