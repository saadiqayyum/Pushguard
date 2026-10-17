"use client"

import { useState } from "react"
import { Download, Upload } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { api, ApiClientError } from "@/lib/api-client"

// Import a rules file.
export function ImportRulesDialog() {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState("")
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function submit() {
    if (!content.trim()) return
    setBusy(true)
    try {
      const result = await api<{ created: number; updated: number; total: number }>(
        "/api/rules/import",
        { method: "POST", body: { content } },
      )
      toast.success(
        `Imported ${result.total}: ${result.created} new, ${result.updated} updated`,
      )
      setOpen(false)
      setContent("")
      router.refresh()
    } catch (cause) {
      toast.error(cause instanceof ApiClientError ? cause.message : "Could not import that file")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload className="size-4" />
        Import
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl gap-4 overflow-y-auto p-6 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import rules</DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href="/api/rules/export?example=1" download>
                <Download className="size-4" />
                Example file
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/api/rules/export" download>
                <Download className="size-4" />
                Export my rules
              </a>
            </Button>
          </div>

          <input
            type="file"
            accept=".yaml,.yml,.json,text/yaml,application/json"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (file) setContent(await file.text())
            }}
            className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
          />

          <Textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={14}
            spellCheck={false}
            placeholder={"- id: no-force-push\n  severity: critical\n  when:\n    forced: true"}
            className="font-mono text-xs"
          />

          <div className="sticky bottom-0 -mx-6 -mb-6 flex justify-end gap-2 border-t bg-popover px-6 py-4">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || !content.trim()} aria-busy={busy}>
              Import
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
