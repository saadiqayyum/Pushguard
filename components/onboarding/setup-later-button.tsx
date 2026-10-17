"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { SETUP_LATER_COOKIE } from "@/lib/dashboard-state"

// A session cookie, so the layout can skip onboarding until the browser closes.
export function SetupLaterButton({ org }: { org: string }) {
  const router = useRouter()
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        document.cookie = `${SETUP_LATER_COOKIE}=${encodeURIComponent(org)}; path=/; samesite=lax`
        router.refresh()
      }}
    >
      Continue to dashboard
    </Button>
  )
}
