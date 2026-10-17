"use client"

import { useState } from "react"
import { toast } from "sonner"
import { ChipInput } from "@/components/rules/chip-input"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { api, ApiClientError } from "@/lib/api-client"

export function BranchesDialog({
  open,
  onOpenChange,
  saved,
  onSaved,
  max,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  saved: string[]
  onSaved: (branches: string[]) => void
  max: number
}) {
  const [branches, setBranches] = useState(saved)
  const [busy, setBusy] = useState(false)
  const dirty = branches.join("\n") !== saved.join("\n")

  async function save() {
    setBusy(true)
    try {
      const result = await api<{ branches: string[] }>("/api/settings/indicator-branches", {
        method: "PUT",
        body: { branches },
      })
      onSaved(result.branches)
      toast.success("Saved")
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Could not save")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setBranches(saved)
        onOpenChange(next)
      }}
    >
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg">
        <DialogHeader>
          <DialogTitle>Threat indicator branches</DialogTitle>
        </DialogHeader>
        <p className="flex items-center gap-2 text-sm">
          <span className="rounded-md border px-2 py-0.5 font-mono text-xs">default branch</span>
          <span className="text-xs text-muted-foreground">always</span>
        </p>
        <ChipInput
          values={branches}
          onChange={(next) => setBranches(next.slice(0, max))}
          label="Additional branches"
          placeholder="release/*"
          mono
        />
        <DialogFooter>
          <Button onClick={save} disabled={!dirty || busy}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
