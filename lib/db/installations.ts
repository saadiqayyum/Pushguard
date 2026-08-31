import { defineCollection } from "./client"

export type AiProvider = "anthropic" | "openai" | "google-genai"

// A stored key with the secret removed. The only shape that may leave the server.
export type PublicAiKey = {
  id: string
  label: string
  provider: AiProvider
  keyHint: string
  model: string
  effort: "low" | "medium" | "high"
}

export type InstallationDoc = {
  _id: string
  org: string
  installationId: number
  active: boolean
  repos?: string[]
  teams?: string[]
  accountType?: "User" | "Organization"
  alertMention: string | null
  aiKeys?: (PublicAiKey & {
    key: { ciphertext: string; iv: string; tag: string }
    addedBy: string
    addedAt: Date
  })[]
  aiDefaultKey?: string
  installedBy: string
  createdAt: Date
  updatedAt: Date
}

export const installations = defineCollection<InstallationDoc>("installations", [
  { keys: { org: 1 }, options: { unique: true } },
])

// The installation a scan ran through, looked up by GitHub's id rather than by
// account name: the account can be renamed, the id cannot.
export function installationById(installationId: number): Promise<InstallationDoc | null> {
  return installations().findOne({ installationId, active: true })
}

export function activeInstallation(org: string): Promise<InstallationDoc | null> {
  return installations().findOne({ org, active: true })
}

// The installation as a page or an API response may see it.
export async function installationForDisplay(
  org: string,
): Promise<{ aiKeys: PublicAiKey[]; aiDefaultKey: string | null } | null> {
  const doc = await installations().findOne({ org }, { projection: { "aiKeys.key": 0 } })
  if (!doc) return null
  return {
    aiKeys: (doc.aiKeys ?? []) as PublicAiKey[],
    aiDefaultKey: doc.aiDefaultKey ?? null,
  }
}

