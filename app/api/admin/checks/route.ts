import { asSystem } from "@/lib/db"
import { adminRoute } from "@/lib/platform/auth"
import { saveCheckScriptDraft } from "@/lib/platform/check-scripts"
import { respond } from "@/lib/route"
import { checkSavedOut } from "@/schemas/admin"

export const POST = adminRoute("/api/admin/checks", async (request, _context, admin) => {
  const body: unknown = await request.json()
  const saved = await asSystem(() => saveCheckScriptDraft(admin.login, body))
  return respond(checkSavedOut, saved)
})
