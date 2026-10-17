"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { api, ApiClientError } from "@/lib/api-client"

export function InboxStateButton({ id, state }: { id: string; state: "new" | "dismissed" }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const next = state === "new" ? "dismissed" : "new"

  async function change() {
    setBusy(true)
    try {
      await api(`/api/admin/contributor/${id}`, { method: "POST", body: { state: next } })
      router.refresh()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Could not update")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button size="sm" variant="ghost" onClick={change} disabled={busy}>
      {state === "new" ? "Dismiss" : "Restore"}
    </Button>
  )
}
