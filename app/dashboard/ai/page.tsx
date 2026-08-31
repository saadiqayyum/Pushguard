import { redirect } from "next/navigation"
import { AiView, type AiSettings } from "@/components/ai-view"
import { auth, memberScopes } from "@/lib/auth"
import { installationForDisplay } from "@/lib/db"
import { resolveTenant } from "@/lib/tenant"

export const dynamic = "force-dynamic"

// Reads the stored keys and deliberately never reads their ciphertext: the.
export default async function AiPage() {
  const session = await auth()
  if (!session?.user) redirect("/signin")

  const login = session.login || session.user.name || ""
  const tenant = await resolveTenant(memberScopes({ login, orgs: session.orgs ?? [] }))
  if (!tenant.current) return null

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
