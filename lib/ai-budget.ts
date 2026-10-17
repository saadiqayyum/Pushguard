import type { AIMessage } from "@langchain/core/messages"
import { toFinding } from "@/lib/finding"
import type { ScanFinding } from "@/lib/db"

// Token budgets for model review. Pure: the DB-backed daily counter is injected.

export const AI_LIMITS = {
  maxInputTokensPerRun: { default: 60_000, ceiling: 400_000 },
  maxOutputTokens: { default: 8_000, ceiling: 32_000 },
  thinkingBudget: { default: 4_000, ceiling: 24_000 },
  timeoutMs: { default: 30_000, ceiling: 60_000 },
  maxToolCalls: { default: 40, ceiling: 120 },
  pushTokenBudget: { default: 200_000, ceiling: 2_000_000 },
  dailyTokenBudget: { default: 2_000_000, ceiling: 50_000_000 },
} as const

export type AiLimit = keyof typeof AI_LIMITS

// Providers report real usage after the call; before it, four characters a
// token is the usual English-and-code average and errs on the high side.
export const CHARS_PER_TOKEN = 4

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

// A stored or requested value, clamped to its ceiling; absent means the default.
export function clampLimit(name: AiLimit, value: number | null | undefined): number {
  const { default: fallback, ceiling } = AI_LIMITS[name]
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return fallback
  return Math.min(Math.floor(value), ceiling)
}

export type TokenUsage = { input: number; output: number }

// LangChain normalizes usage onto usage_metadata; older adapters only fill
// response_metadata, in each provider's own field names.
export function usageOf(message: Pick<AIMessage, "usage_metadata" | "response_metadata"> | undefined): TokenUsage | null {
  if (!message) return null
  if (message.usage_metadata) {
    return { input: message.usage_metadata.input_tokens ?? 0, output: message.usage_metadata.output_tokens ?? 0 }
  }
  const meta = (message.response_metadata ?? {}) as Record<string, Record<string, number> | undefined>
  const usage = meta.usage ?? meta.tokenUsage ?? meta.usageMetadata
  if (!usage) return null
  return {
    input: usage.input_tokens ?? usage.prompt_tokens ?? usage.promptTokens ?? usage.promptTokenCount ?? 0,
    output: usage.output_tokens ?? usage.completion_tokens ?? usage.completionTokens ?? usage.candidatesTokenCount ?? 0,
  }
}

export type BudgetScope = "run" | "push" | "daily"

export class BudgetExhausted extends Error {
  constructor(readonly scope: BudgetScope, readonly needed: number, readonly remaining: number) {
    super(`${scope} token budget exhausted: needed ~${needed}, ${remaining} left`)
  }
}

// Shared by every rule on one push; each rule run gets its own run meter on top.
export type PushMeter = { limit: number; spent: number }

export type RunMeter = {
  push: PushMeter
  runLimit: number
  runInput: number
  calls: number
  usage: TokenUsage
}

export function pushMeter(limit: number): PushMeter {
  return { limit, spent: 0 }
}

export function runMeter(push: PushMeter, runLimit: number): RunMeter {
  return { push, runLimit, runInput: 0, calls: 0, usage: { input: 0, output: 0 } }
}

// Which budget a call of this size would break, or null when it fits. The
// output is charged at its cap because that is what the call may spend.
export function refusal(meter: RunMeter, estimatedInput: number, maxOutput: number): BudgetExhausted | null {
  const runLeft = meter.runLimit - meter.runInput
  if (estimatedInput > runLeft) return new BudgetExhausted("run", estimatedInput, Math.max(0, runLeft))
  const pushLeft = meter.push.limit - meter.push.spent
  if (estimatedInput + maxOutput > pushLeft) {
    return new BudgetExhausted("push", estimatedInput + maxOutput, Math.max(0, pushLeft))
  }
  return null
}

export function charge(meter: RunMeter, usage: TokenUsage): void {
  meter.calls++
  meter.runInput += usage.input
  meter.usage.input += usage.input
  meter.usage.output += usage.output
  meter.push.spent += usage.input + usage.output
}

const BUDGET_FINDING = {
  id: "ai-budget-exhausted",
  severity: "high" as const,
  description: "A token budget ran out, so part of this change was never reviewed by a model",
}

// Never silent: a reader cannot tell "the budget ran out" from "nothing found".
export function budgetFinding(repo: string, files: string[], error: BudgetExhausted, unreviewed: string): ScanFinding {
  return toFinding(BUDGET_FINDING, repo, files, [
    `The ${error.scope} token budget ran out (needed about ${error.needed}, ${error.remaining} left), so ${unreviewed} was not reviewed by a model.`,
  ], { prose: true })
}
