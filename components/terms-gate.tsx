"use client"

import { Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { api } from "@/lib/api-client"
import { signOutAction } from "@/lib/actions"

const LINK = "font-medium text-foreground underline underline-offset-4 hover:text-primary"

export function TermsLinks() {
  return (
    <>
      <Link href="/terms" target="_blank" rel="noopener" className={LINK}>
        Terms of Service
      </Link>{" "}
      and{" "}
      <Link href="/privacy" target="_blank" rel="noopener" className={LINK}>
        Privacy Policy
      </Link>
    </>
  )
}

const block = (event: Event) => event.preventDefault()

// Rendered in place of the page until the current version is accepted. It cannot be dismissed.
export function TermsGate({ version }: { version: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setBusy(true)
    setError(null)
    try {
      await api("/api/terms/accept", { method: "POST", body: { version } })
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed")
      setBusy(false)
    }
  }

  return (
    <Dialog open>
      <DialogContent showCloseButton={false} onEscapeKeyDown={block} onPointerDownOutside={block} onInteractOutside={block}>
        <DialogHeader>
          <DialogTitle>We updated our Terms</DialogTitle>
          <DialogDescription>
            Updated {version}. Read the <TermsLinks />.
          </DialogDescription>
        </DialogHeader>
        <p role="alert" className="min-h-5 text-sm text-destructive">
          {error}
        </p>
        <DialogFooter>
          <form action={signOutAction}>
            <Button type="submit" variant="outline" className="w-full sm:w-auto">
              Sign out
            </Button>
          </form>
          <Button onClick={accept} disabled={busy} className="min-w-24">
            {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-label="Saving" /> : "Accept"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
