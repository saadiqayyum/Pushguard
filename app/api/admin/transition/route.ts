import { asSystem } from "@/lib/db"
import { adminRoute } from "@/lib/platform/auth"
import { checkScriptKind } from "@/lib/platform/check-scripts"
import { staffRuleKind } from "@/lib/platform/staff-rule-kind"
import { transition } from "@/lib/platform/transition"
import { respond } from "@/lib/route"
import { problemsOut, transitionBody } from "@/schemas/admin"

export const maxDuration = 60

export const POST = adminRoute("/api/admin/transition", async (request, _context, admin) => {
  const { kind, ...input } = transitionBody.parse(await request.json())
  const result = await asSystem(() => (kind === "check" ? transition(checkScriptKind, admin.login, input) : transition(staffRuleKind, admin.login, input)))
  return respond(problemsOut, result)
})
