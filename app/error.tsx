"use client"

import { AlertTriangle } from "lucide-react"
import { CONTAINER } from "@/components/app-header"
import { Button } from "@/components/ui/button"

// The server logs the error under this digest; the client only ever sees the digest.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className={`${CONTAINER} flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center`}>
      <AlertTriangle className="size-6 text-destructive/80" aria-hidden />
      <h1 className="text-lg font-semibold">Page failed to load</h1>
      <Button size="sm" onClick={() => retry()}>
        Retry
      </Button>
      {error.digest && <p className="font-mono text-xs text-muted-foreground">{error.digest}</p>}
    </div>
  )
}
