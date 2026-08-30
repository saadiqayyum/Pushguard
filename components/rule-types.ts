import type { Rule } from "@/schemas/rule"

// A leaf module on purpose. rules-view renders rule-form, and rule-form needs
// this shape back, defining it in either one makes the two import each other,
// and a cycle in the client graph breaks module evaluation under Turbopack.
export type RuleRow = {
  id: string
  ruleId: string
  body: Rule
  enabled: boolean
  createdBy: string
  updatedAt: string
}
