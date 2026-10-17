import { asSystem } from "@/lib/db"
import { adminRoute } from "@/lib/platform/auth"
import { saveStaffRule } from "@/lib/platform/staff-rule-kind"
import { respond } from "@/lib/route"
import { saveStaffRuleBody, savedOut } from "@/schemas/admin"

export const POST = adminRoute("/api/admin/rules", async (request, _context, admin) => {
  const { rule, isNew } = saveStaffRuleBody.parse(await request.json())
  const saved = await asSystem(() => saveStaffRule(admin.login, rule, isNew))
  return respond(savedOut, saved)
})
