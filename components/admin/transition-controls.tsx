"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { api, ApiClientError } from "@/lib/api-client"
import { TRANSITIONS, type Status } from "@/lib/platform/lifecycle"
import { OVERRIDE_REASON_MAX, SHADOW_MIN_MS } from "@/lib/platform/limits"

const LABEL: Record<Status, string> = {
  draft: "Back to draft",
  review: "Send to review",
  shadow: "Start shadow",
  published: "Publish",
  internal: "Mark internal",
  retired: "Retire",
}

export type ArtifactKindName = "rule" | "check"

export function TransitionControls({ kind, id, version, status }: { kind: ArtifactKindName; id: string; version: number; status: Status }) {
  const router = useRouter()
  const [pending, setPending] = useState<Status | null>(null)
  const [override, setOverride] = useState("")
  const [busy, setBusy] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const options = TRANSITIONS[status]
  if (options.length === 0) return null

  async function go(to: Status) {
    setBusy(true)
    setProblems([])
    try {
      const result = await api<{ problems: string[] }>("/api/admin/transition", {
        method: "POST",
        body: { kind, id, version, to, ...(to === "published" && override.trim() ? { override: override.trim() } : {}) },
      })
      if (result.problems.length) {
        setProblems(result.problems)
        return
      }
      toast.success(`Moved to ${to}`)
      setPending(null)
      setOverride("")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Could not change status")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {options.map((to) => (
          <Button
            key={to}
            size="sm"
            variant={to === "retired" ? "outline" : to === "draft" ? "ghost" : "default"}
            disabled={busy}
            onClick={() => (to === "published" || to === "retired" ? setPending(to) : go(to))}
          >
            {LABEL[to]}
          </Button>
        ))}
      </div>

      {pending && (
        <div className="space-y-2 rounded-md border p-3">
          {pending === "published" ? (
            <>
              <Label htmlFor="override">Override reason (only if shadow ran under {SHADOW_MIN_MS / 86_400_000} days)</Label>
              <Textarea id="override" rows={2} maxLength={OVERRIDE_REASON_MAX} value={override} onChange={(e) => setOverride(e.target.value)} />
            </>
          ) : (
            <p className="text-sm">Retire version {version}? It stops running everywhere.</p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => go(pending)} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
              Confirm {LABEL[pending].toLowerCase()}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {problems.length > 0 && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Blocked</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-4">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
