"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { api, ApiClientError } from "@/lib/api-client"

export function CheckEditor({
  initial,
  isNew,
  languages,
  note,
}: {
  initial: { id: string; language: string; body: string }
  isNew: boolean
  languages: readonly string[]
  note?: string
}) {
  const router = useRouter()
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      const saved = await api<{ id: string; version: number; sha256: string }>("/api/admin/checks", { method: "POST", body: form })
      toast.success(`Saved ${saved.id} v${saved.version}`)
      router.push(`/admin/checks/${saved.id}`)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Could not save")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cs-id">Id</Label>
          <Input id="cs-id" value={form.id} disabled={!isNew} onChange={(e) => setForm({ ...form, id: e.target.value })} className="font-mono" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cs-language">Language</Label>
          <Select value={form.language} onValueChange={(language) => setForm({ ...form, language })}>
            <SelectTrigger id="cs-language" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languages.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cs-body">Check</Label>
        <Textarea id="cs-body" rows={24} spellCheck={false} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="font-mono text-xs" />
      </div>
      <Button onClick={save} disabled={busy || !form.id || !form.body}>
        {busy && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
        Save draft
      </Button>
    </div>
  )
}
