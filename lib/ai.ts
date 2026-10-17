import { clampLimit } from "@/lib/ai-budget";
import { logger } from "@/lib/logger";
import { open } from "@/lib/secret-box";
import { publicAiKeys, sealedAiKey, type InstallationDoc, type SealedAiKey } from "@/lib/db";

// The key an account's model review runs on, or null when it has none.
// There is no operator fallback: an account pays for its own reviews, so a
// rule with no readable key does not run rather than billing somebody else.
export type AiProvider = "anthropic" | "openai" | "google-genai";

export type AiCredentials = {
  provider: AiProvider;
  apiKey: string;
  model: string;
  effort: "low" | "medium" | "high";
  label: string;
  baseUrl?: string;
  maxOutputTokens: number;
  thinkingBudget: number;
  timeoutMs: number;
};

// A rule may tune the call it pays for, within the same ceilings as a key.
export type ModelOverrides = {
  model?: string;
  effort?: AiCredentials["effort"];
  max_output_tokens?: number;
  thinking_budget?: number;
  timeout_ms?: number;
};

export function withOverrides(credentials: AiCredentials, rule: ModelOverrides): AiCredentials {
  return {
    ...credentials,
    model: rule.model ?? credentials.model,
    effort: rule.effort ?? credentials.effort,
    maxOutputTokens: clampLimit("maxOutputTokens", rule.max_output_tokens ?? credentials.maxOutputTokens),
    thinkingBudget: clampLimit("thinkingBudget", rule.thinking_budget ?? credentials.thinkingBudget),
    timeoutMs: clampLimit("timeoutMs", rule.timeout_ms ?? credentials.timeoutMs),
  };
}

export async function aiCredentials(
  installation: Pick<InstallationDoc, "org" | "aiDefaultKey">,
  keyId?: string,
): Promise<AiCredentials | null> {
  const { org } = installation;
  const chosen =
    (keyId ? await sealedAiKey(org, keyId) : null) ??
    (installation.aiDefaultKey ? await sealedAiKey(org, installation.aiDefaultKey) : null) ??
    (await firstKey(org));

  if (!chosen) return null;

  // Decrypted here and held only for this call. A key that will not open,
  // because ENCRYPTION_KEY was rotated or the row was tampered with, disables
  // review rather than running on something else.
  const apiKey = open(chosen)?.trim();
  if (!apiKey) {
    logger.warn("ai_key_unreadable", { keyId: chosen.id });
    return null;
  }

  return {
    provider: chosen.provider,
    apiKey,
    model: chosen.model,
    effort: chosen.effort,
    label: chosen.label,
    baseUrl: chosen.baseUrl ?? undefined,
    maxOutputTokens: clampLimit("maxOutputTokens", chosen.maxOutputTokens),
    thinkingBudget: clampLimit("thinkingBudget", chosen.thinkingBudget),
    timeoutMs: clampLimit("timeoutMs", chosen.timeoutMs),
  };
}

async function firstKey(org: string): Promise<SealedAiKey | null> {
  const [first] = await publicAiKeys(org);
  return first ? sealedAiKey(org, first.id) : null;
}
