import { redirect } from "next/navigation"
import { AiView, type AiSettings } from "@/components/ai-view"
import { pageMember } from "@/lib/auth"
import { installationForDisplay } from "@/lib/db"
import { resolveTenant } from "@/lib/tenant"

export const dynamic = "force-dynamic"

// Reads the stored keys and deliberately never reads their ciphertext: the.
export default async function AiPage() {
  const tenant = await resolveTenant(await pageMember())
  if (!tenant.current) return null
  if (!tenant.manages) redirect("/dashboard")

  const doc = await installationForDisplay(tenant.current.org)
  const settings: AiSettings = {
    keys: (doc?.aiKeys ?? []).map((entry) => ({
      id: entry.id,
      label: entry.label,
      provider: entry.provider,
      keyHint: entry.keyHint,
      model: entry.model,
      effort: entry.effort,
    })),
    defaultKey: doc?.aiDefaultKey ?? null,
    encryptionReady: Boolean(process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length >= 32),
  }

  return <AiView initial={settings} />
}
