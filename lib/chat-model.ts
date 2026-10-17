import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { AiCredentials, AiProvider } from "@/lib/ai";

// One model, built from a static import per provider.
//
// `initChatModel` resolves the provider package through an import() whose
// specifier is computed at runtime. A bundler cannot follow that, so on Next it
// fails with "Cannot find module as expression is too dynamic" and every model
// call dies before it is made. Three named imports and a switch cost nothing
// and are something the bundler can see.
export function chatModel(
  provider: AiProvider,
  model: string,
  options: {
    maxTokens: number;
    maxRetries: number;
    effort?: AiCredentials["effort"];
    thinkingBudget?: number;
    baseUrl?: string;
  },
  apiKey: string,
): BaseChatModel {
  const { maxTokens, maxRetries, effort, thinkingBudget, baseUrl } = options;

  switch (provider) {
    case "anthropic":
      return new ChatAnthropic({
        model,
        apiKey,
        maxTokens,
        maxRetries,
        anthropicApiUrl: baseUrl,
        ...anthropicThinking(model, maxTokens, effort, thinkingBudget),
      });
    case "openai":
      return new ChatOpenAI({
        model,
        apiKey,
        maxTokens,
        maxRetries,
        configuration: baseUrl ? { baseURL: baseUrl } : undefined,
        ...(effort ? { reasoning: { effort } } : {}),
      });
    case "google-genai":
      return new ChatGoogleGenerativeAI({
        model,
        apiKey,
        maxOutputTokens: maxTokens,
        maxRetries,
        baseUrl,
        ...googleThinking(model, effort, thinkingBudget),
      });
  }
}

// Models before 4.6 take a fixed thinking budget and reject effort; later ones
// reject the budget with a 400 and take adaptive thinking plus effort.
const LEGACY_ANTHROPIC = /claude-(3|(haiku|sonnet|opus)-4-[0-5]\b|(haiku|sonnet|opus)-4-\d{8})/;
const MIN_THINKING_BUDGET = 1024;

function anthropicThinking(
  model: string,
  maxTokens: number,
  effort?: AiCredentials["effort"],
  thinkingBudget?: number,
) {
  if (LEGACY_ANTHROPIC.test(model)) {
    const budget = Math.min(thinkingBudget ?? 0, maxTokens - 1);
    return effort && budget >= MIN_THINKING_BUDGET
      ? { thinking: { type: "enabled" as const, budget_tokens: budget } }
      : {};
  }
  return effort ? { thinking: { type: "adaptive" as const }, outputConfig: { effort } } : {};
}

// Gemini 3 takes a level, 2.5 a token budget; sending the other is an error.
function googleThinking(model: string, effort?: AiCredentials["effort"], thinkingBudget?: number) {
  if (/gemini-2\.5/.test(model) && thinkingBudget) return { thinkingConfig: { thinkingBudget } };
  if (/gemini-[3-9]/.test(model) && effort) {
    return { thinkingConfig: { thinkingLevel: effort.toUpperCase() as "LOW" | "MEDIUM" | "HIGH" } };
  }
  return {};
}

// Triage always runs on something cheap, whoever the provider is.
// It answers one yes/no question over most of the tokens, so paying
// capable-model rates for it is the whole cost problem.
export const TRIAGE_MODEL: Record<AiProvider, string> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4o-mini",
  "google-genai": "gemini-3.6-flash",
};
