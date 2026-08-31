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
  },
  apiKey: string,
): BaseChatModel {
  const { maxTokens, maxRetries, effort } = options;

  switch (provider) {
    case "anthropic":
      return new ChatAnthropic({
        model,
        apiKey,
        maxTokens,
        maxRetries,
        // Anthropic-only. Sending either to another provider is a 400.
        ...(effort
          ? { thinking: { type: "adaptive" }, outputConfig: { effort } }
          : {}),
      });
    case "openai":
      return new ChatOpenAI({ model, apiKey, maxTokens, maxRetries });
    case "google-genai":
      return new ChatGoogleGenerativeAI({
        model,
        apiKey,
        maxOutputTokens: maxTokens,
        maxRetries,
      });
  }
}

// Triage always runs on something cheap, whoever the provider is.
// It answers one yes/no question over most of the tokens, so paying
// capable-model rates for it is the whole cost problem.
export const TRIAGE_MODEL: Record<AiProvider, string> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4o-mini",
  "google-genai": "gemini-3.6-flash",
};
