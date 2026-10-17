import { env } from "@/lib/env"
import { DEFAULT_PLATFORM_MODEL } from "./limits"

// The AI security expert runs on the platform's key; no key means the feature is off.
export function platformModel(): { provider: "anthropic" | "openai" | "google-genai"; model: string; apiKey: string } | null {
  const { PLATFORM_AI_KEY: apiKey, PLATFORM_AI_PROVIDER: provider, PLATFORM_AI_MODEL: model } = env()
  if (!apiKey) return null
  const chosen = model ?? (provider === "anthropic" ? DEFAULT_PLATFORM_MODEL : null)
  return chosen ? { provider, model: chosen, apiKey } : null
}
