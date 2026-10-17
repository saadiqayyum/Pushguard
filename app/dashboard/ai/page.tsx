import { redirect } from "next/navigation"
import { BudgetDialog } from "@/components/ai/budget-dialog"
import { McpTokensDialog } from "@/components/ai/mcp-tokens-dialog"
import { AiView } from "@/components/ai-view"
import { clampLimit } from "@/lib/ai-budget"
import { activeInstallation, aiUsageToday, publicAiKeys, publicMcpTokens, withUser } from "@/lib/db"
import { env } from "@/lib/env"
import { pageTenant } from "@/lib/tenant"

export const dynamic = "force-dynamic"

// publicAiKeys cannot select the sealed columns: the app role has no grant on them.
export default async function AiPage() {
  const view = await pageTenant()
  const current = view.current
  if (!current) return null
  if (current.role !== "admin") redirect("/dashboard")

  const [keys, installation, usage, tokens] = await withUser(view.login, () =>
    Promise.all([
      publicAiKeys(current.org),
      activeInstallation(current.org),
      aiUsageToday(current.org),
      publicMcpTokens(current.org),
    ]),
  )
  return (
    <AiView
      initial={{
        keys,
        defaultKey: installation?.aiDefaultKey ?? null,
        encryptionReady: Boolean(process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length >= 32),
      }}
      actions={
        <>
          <BudgetDialog
            initial={{
              dailyTokenBudget: clampLimit("dailyTokenBudget", installation?.aiDailyTokenBudget),
              pushTokenBudget: clampLimit("pushTokenBudget", installation?.aiPushTokenBudget),
              stored: { daily: installation?.aiDailyTokenBudget ?? null, push: installation?.aiPushTokenBudget ?? null },
              usage,
            }}
          />
          <McpTokensDialog
            endpoint={new URL("/api/mcp", env().AUTH_URL).toString()}
            initial={tokens.map((t) => ({
              ...t,
              createdAt: t.createdAt.toISOString(),
              lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
            }))}
          />
        </>
      }
    />
  )
}
