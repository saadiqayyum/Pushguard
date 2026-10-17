"use client"

import { useState } from "react"
import { Loader2, Plus, Trash2, Webhook } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api, ApiClientError } from "@/lib/api-client"
import { MAX_SINK_LABEL, MAX_SINK_URL, type SinkView } from "@/schemas/alert-sink"

const failure = (error: unknown, fallback: string) => (error instanceof ApiClientError ? error.message : fallback)

export function SinksDialog({
  open,
  onOpenChange,
  sinks,
  onChange,
  max,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sinks: SinkView[]
  onChange: (sinks: SinkView[]) => void
  max: number
}) {
  const [label, setLabel] = useState("")
  const [url, setUrl] = useState("")
  const [busy, setBusy] = useState<string | null>(null)

  async function add(event: React.FormEvent) {
    event.preventDefault()
    setBusy("add")
    try {
      const sink = await api<SinkView>("/api/alert-sinks", { method: "POST", body: { label, url } })
      onChange([...sinks, sink])
      setLabel("")
      setUrl("")
      toast.success("Destination added")
    } catch (error) {
      toast.error(failure(error, "Could not add destination"))
    } finally {
      setBusy(null)
    }
  }

  async function remove(id: string) {
    setBusy(id)
    try {
      await api(`/api/alert-sinks/${id}`, { method: "DELETE" })
      onChange(sinks.filter((sink) => sink.id !== id))
    } catch (error) {
      toast.error(failure(error, "Could not remove destination"))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Alert destinations</DialogTitle>
        </DialogHeader>

        {sinks.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {sinks.map((sink) => (
              <li key={sink.id} className="flex items-center gap-3 py-1.5 pr-1.5 pl-3">
                <Webhook className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{sink.label}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {sink.host} …{sink.hint}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${sink.label}`}
                  disabled={busy !== null}
                  onClick={() => remove(sink.id)}
                >
                  {busy === sink.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {sinks.length < max ? (
          <form onSubmit={add} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="sink-label">Name</Label>
              <Input id="sink-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={MAX_SINK_LABEL} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sink-url">Slack or Discord webhook URL</Label>
              <Input
                id="sink-url"
                type="url"
                inputMode="url"
                className="font-mono text-xs"
                placeholder="https://hooks.slack.com/services/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                maxLength={MAX_SINK_URL}
                required
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={busy !== null}>
                {busy === "add" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Add destination
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground tabular-nums">Limit of {max} reached</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
