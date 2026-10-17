import type { AIMessage, BaseMessage } from "@langchain/core/messages"
import {
  BudgetExhausted,
  charge,
  clampLimit,
  estimateTokens,
  pushMeter,
  refusal,
  runMeter,
  usageOf,
  type PushMeter,
  type RunMeter,
} from "@/lib/ai-budget"
import { reserveAiTokens, settleAiTokens, type InstallationDoc } from "@/lib/db"
import type { AiCredentials } from "@/lib/ai"

// Every model call goes through here: estimated and refused before it is made,
// held against the org's day, then charged with what the provider reported.
export type Spend = {
  org: string
  dailyCap: number
  meter: RunMeter
  maxOutput: number
  timeoutMs: number
}

export function pushMeterFor(installation: Pick<InstallationDoc, "aiPushTokenBudget">): PushMeter {
  return pushMeter(clampLimit("pushTokenBudget", installation.aiPushTokenBudget))
}

export function spendFor(
  installation: Pick<InstallationDoc, "org" | "aiDailyTokenBudget">,
  push: PushMeter,
  credentials: AiCredentials,
  maxInputTokens?: number,
): Spend {
  return {
    org: installation.org,
    dailyCap: clampLimit("dailyTokenBudget", installation.aiDailyTokenBudget),
    meter: runMeter(push, clampLimit("maxInputTokensPerRun", maxInputTokens)),
    maxOutput: credentials.maxOutputTokens,
    timeoutMs: credentials.timeoutMs,
  }
}

const textOf = (messages: BaseMessage[]) =>
  messages.map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))).join("\n")

export async function meteredInvoke<T>(
  spend: Spend,
  messages: BaseMessage[],
  call: (signal: AbortSignal) => Promise<{ raw: AIMessage | undefined; value: T }>,
  deadline?: AbortSignal,
): Promise<T> {
  const estimate = estimateTokens(textOf(messages))
  const refused = refusal(spend.meter, estimate, spend.maxOutput)
  if (refused) throw refused

  const reserved = estimate + spend.maxOutput
  if (!(await reserveAiTokens(spend.org, reserved, spend.dailyCap))) {
    throw new BudgetExhausted("daily", reserved, 0)
  }

  const own = AbortSignal.timeout(spend.timeoutMs)
  const signal = deadline ? AbortSignal.any([deadline, own]) : own
  let usage = { input: estimate, output: 0 }
  try {
    const { raw, value } = await call(signal)
    usage = usageOf(raw) ?? { input: estimate, output: raw ? estimateTokens(textOf([raw])) : 0 }
    return value
  } finally {
    charge(spend.meter, usage)
    await settleAiTokens(spend.org, reserved, usage.input, usage.output)
  }
}
