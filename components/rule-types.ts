import type { Rule } from "@/schemas/rule"
import type { AiRule } from "@/schemas/ai-rule"

// A leaf module on purpose: rules-view and rule-form both need it, and a cycle
// between them breaks client module evaluation under Turbopack.
type Base = { id: string; ruleId: string; enabled: boolean; updatedAt: string | null }

export type PatternRow = Base & { kind: "pattern"; pack: string | null; origin: "catalog" | "modified" | "custom"; body: Rule }
export type AiRow = Base & { kind: "ai"; pack: null; origin: "custom"; body: AiRule }
export type RuleRow = PatternRow | AiRow
