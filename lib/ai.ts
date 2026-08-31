import { logger } from "@/lib/logger";
import { open } from "@/lib/secret-box";
import type { InstallationDoc } from "@/lib/db";

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
};

export function aiCredentials(
  installation: Pick<InstallationDoc, "aiKeys" | "aiDefaultKey">,
  keyId?: string,
): AiCredentials | null {
  const keys = installation.aiKeys ?? [];
  const chosen =
    (keyId && keys.find((entry) => entry.id === keyId)) ??
    keys.find((entry) => entry.id === installation.aiDefaultKey) ??
    keys[0];

  if (!chosen) return null;

  // Decrypted here and held only for this call. A key that will not open,
  // because ENCRYPTION_KEY was rotated or the row was tampered with, disables
  // review rather than running on something else.
  const apiKey = open(chosen.key)?.trim();
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
  };
}
