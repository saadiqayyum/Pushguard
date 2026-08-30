import type { Rule } from "@/schemas/rule"

// A leaf module on purpose. rules-view renders rule-form, and rule-form needs
// this shape back, defining it in either one makes the two import each other,
// and a cycle in the client graph breaks module evaluation under Turbopack.
export type RuleRow = {
  id: string
  ruleId: string
  /** Which catalog pack it belongs to. Null for a rule written here. */
  pack: string | null
  /**
   * `catalog` ships with Pushguard and has no database row; `modified` is a
   * catalog rule this account changed; `custom` is one they wrote. The
   * distinction is what makes "undo my change" different from "delete".
   */
  origin: "catalog" | "modified" | "custom"
  body: Rule
  enabled: boolean
  /** Null while a catalog rule is untouched: nothing has been written yet. */
  updatedAt: string | null
}
