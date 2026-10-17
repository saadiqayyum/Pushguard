import { z } from "zod"
import { asSystem, recordPlatformAudit, setContributorDraftState } from "@/lib/db"
import { AppError } from "@/lib/errors"
import { adminRoute } from "@/lib/platform/auth"
import { respond } from "@/lib/route"
import { inboxStateBody, savedOut } from "@/schemas/admin"

export const POST = adminRoute("/api/admin/contributor/[id]", async (request, context, admin) => {
  const id = z.uuid().parse((await context.params).id)
  const { state } = inboxStateBody.parse(await request.json())
  await asSystem(async () => {
    if (!(await setContributorDraftState(id, state))) throw new AppError("not_found", "Not found")
    await recordPlatformAudit({ actor: admin.login, action: "inbox_state_changed", target: `contributor_draft:${id}`, details: { state } })
  })
  return respond(savedOut.pick({ id: true }), { id })
})
