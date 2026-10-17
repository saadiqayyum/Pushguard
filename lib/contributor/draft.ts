import { HumanMessage, SystemMessage, type AIMessage } from "@langchain/core/messages"
import { z } from "zod"
import { STRUCTURED } from "@/lib/agent-loop"
import { BudgetExhausted, pushMeter, runMeter } from "@/lib/ai-budget"
import { meteredInvoke } from "@/lib/ai-call"
import { chatModel } from "@/lib/chat-model"
import { insertContributorDraft, insertPlatformRule, recordPlatformAudit } from "@/lib/db"
import { logger } from "@/lib/logger"
import { staffRuleKind } from "@/lib/platform/staff-rule-kind"
import { auditTarget, draftVersion } from "@/lib/platform/transition"
import type { ContributorInput } from "./input"
import {
  CONTRIBUTOR_MAX_OUTPUT_TOKENS,
  CONTRIBUTOR_REASONING_MAX,
  CONTRIBUTOR_RUN_TOKEN_BUDGET,
  CONTRIBUTOR_TIMEOUT_MS,
  PLATFORM_DAILY_TOKEN_BUDGET,
  PLATFORM_USAGE_KEY,
} from "./limits"
import { platformModel } from "./model"
import { CONTRIBUTOR_SYSTEM, contributorUser } from "./prompt"
import { inputUrls, validateDraft } from "./validate"

const MAX_RULE_JSON = 200_000
const MAX_FAILURE_TEXT = 300
const ACTOR = "ai-security-expert"

// The condition tree is recursive, which providers' JSON-schema modes handle
// unevenly, so the rule travels as a string and is parsed by staffRuleSchema here.
const answerSchema = z.object({
  reasoning: z.string().max(CONTRIBUTOR_REASONING_MAX),
  rule: z.string().max(MAX_RULE_JSON),
})

async function ask(input: ContributorInput, config: NonNullable<ReturnType<typeof platformModel>>) {
  const llm = chatModel(config.provider, config.model, { maxTokens: CONTRIBUTOR_MAX_OUTPUT_TOKENS, maxRetries: 1 }, config.apiKey).withStructuredOutput(
    answerSchema,
    { name: "draft_rule", ...STRUCTURED },
  )
  const messages = [new SystemMessage(CONTRIBUTOR_SYSTEM), new HumanMessage(contributorUser(input))]
  const spend = {
    org: PLATFORM_USAGE_KEY,
    dailyCap: PLATFORM_DAILY_TOKEN_BUDGET,
    meter: runMeter(pushMeter(CONTRIBUTOR_RUN_TOKEN_BUDGET), CONTRIBUTOR_RUN_TOKEN_BUDGET),
    maxOutput: CONTRIBUTOR_MAX_OUTPUT_TOKENS,
    timeoutMs: CONTRIBUTOR_TIMEOUT_MS,
  }
  return meteredInvoke(spend, messages, async (signal) => {
    const { raw, parsed } = await llm.invoke(messages, { signal })
    return { raw: raw as AIMessage, value: answerSchema.parse(parsed) }
  })
}

const failed = (input: ContributorInput, problem: string) =>
  insertContributorDraft({
    source: input.source,
    title: input.title,
    requestedBy: input.requestedBy,
    inputUrls: input.urls,
    reasoning: "",
    problems: [problem],
    droppedUrls: [],
    valid: false,
  })

// A model that could not answer is filed in the inbox as such, never dropped.
export async function draftRule(input: ContributorInput): Promise<void> {
  const config = platformModel()
  if (!config) {
    logger.warn("contributor_disabled", { source: input.source })
    return
  }

  let answer: z.infer<typeof answerSchema>
  try {
    answer = await ask(input, config)
  } catch (error) {
    const reason =
      error instanceof BudgetExhausted
        ? `The platform ${error.scope} token budget ran out (needed about ${error.needed}).`
        : `${config.provider}/${config.model} did not answer: ${(error instanceof Error ? error.message : String(error)).slice(0, MAX_FAILURE_TEXT)}`
    logger.warn("contributor_model_failed", { source: input.source, reason })
    await failed(input, reason)
    return
  }

  let raw: unknown
  try {
    raw = JSON.parse(answer.rule)
  } catch {
    await failed(input, "The model returned a rule that is not JSON.")
    return
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    await failed(input, "The model returned a rule that is not an object.")
    return
  }

  const id = typeof (raw as { id?: unknown }).id === "string" ? String((raw as { id: string }).id).slice(0, 64) : ""
  const slot = id ? await draftVersion(staffRuleKind, id).catch(() => null) : null
  const verdict = await validateDraft(raw as Record<string, unknown>, {
    allowedUrls: inputUrls([input.text], input.urls),
    allowedDocs: new Set(input.docPath ? [input.docPath] : []),
  })

  const problems = [...verdict.problems]
  const placed = verdict.valid && verdict.rule && slot && !slot.exists
  if (verdict.valid && slot?.exists) problems.push(`A staff draft of ${id} already exists, so this one stays in the inbox.`)
  if (placed && verdict.rule && slot) {
    await insertPlatformRule({ id: verdict.rule.id, version: slot.version, body: verdict.rule, status: "draft", createdBy: ACTOR })
    await recordPlatformAudit({
      actor: ACTOR,
      action: "draft_saved",
      target: auditTarget("rule", verdict.rule.id, slot.version),
      details: { source: input.source, requestedBy: input.requestedBy },
    })
  }
  await insertContributorDraft({
    source: input.source,
    title: input.title,
    requestedBy: input.requestedBy,
    inputUrls: input.urls,
    ruleId: placed && verdict.rule ? verdict.rule.id : null,
    ruleVersion: placed && slot ? slot.version : null,
    body: verdict.body,
    reasoning: answer.reasoning,
    fixtureResults: verdict.fixtures,
    problems,
    droppedUrls: verdict.dropped,
    valid: verdict.valid,
  })
  logger.info("contributor_draft_saved", { source: input.source, valid: verdict.valid, placed: Boolean(placed), dropped: verdict.dropped.length })
}
