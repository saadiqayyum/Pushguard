"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScanPicker } from "@/components/scan-panel"

/**
 * Starting a scan, behind a button.
 *
 * The three pickers used to sit permanently above the scan list, so the page
 * opened on a form rather than on the results it exists to show. Same shape as
 * Rules: a header action that opens a dialog.
 */
export function NewScanDialog({ installUrl, note }: { installUrl: string | null; note: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        New scan
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl gap-6 overflow-y-auto p-6 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New scan</DialogTitle>
          </DialogHeader>
          <ScanPicker installUrl={installUrl} onStarted={() => setOpen(false)} />
          <p className="text-xs text-muted-foreground">{note}</p>
        </DialogContent>
      </Dialog>
    </>
  )
}
