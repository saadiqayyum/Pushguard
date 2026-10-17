"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { PageHeader } from "@/components/page-header"
import { BranchesDialog } from "@/components/settings/branches-dialog"
import { SettingsRow } from "@/components/settings/settings-row"
import { SinksDialog } from "@/components/settings/sinks-dialog"
import { Button } from "@/components/ui/button"
import type { SinkView } from "@/schemas/alert-sink"

type Open = "sinks" | "branches" | null

export function SettingsView({
  org,
  sinks: initialSinks,
  maxSinks,
  branches: initialBranches,
  maxBranches,
}: {
  org: string
  sinks: SinkView[]
  maxSinks: number
  branches: string[]
  maxBranches: number
}) {
  const [open, setOpen] = useState<Open>(null)
  const [sinks, setSinks] = useState(initialSinks)
  const [branches, setBranches] = useState(initialBranches)
  const router = useRouter()
  const toggle = (which: Exclude<Open, null>) => (next: boolean) => setOpen(next ? which : null)
  const saved = <T,>(set: (value: T) => void) => (value: T) => {
    set(value)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description={org}
        actions={
          <Button size="sm" onClick={() => setOpen("sinks")} disabled={sinks.length >= maxSinks}>
            <Plus className="size-4" />
            Add destination
          </Button>
        }
      />

      <ul className="divide-y rounded-lg border">
        <SettingsRow
          label="Alert destinations"
          action={
            <Button size="sm" variant="outline" onClick={() => setOpen("sinks")}>
              {sinks.length === 0 ? "Add" : "Edit"}
            </Button>
          }
        >
          {sinks.length === 0 ? "None" : sinks.map((sink) => sink.label).join(", ")}
        </SettingsRow>
        <SettingsRow
          label="Threat indicator branches"
          action={
            <Button size="sm" variant="outline" onClick={() => setOpen("branches")}>
              Edit
            </Button>
          }
        >
          Default branch
          {branches.length > 0 && <span className="font-mono text-xs">, {branches.join(", ")}</span>}
        </SettingsRow>
      </ul>

      <SinksDialog open={open === "sinks"} onOpenChange={toggle("sinks")} sinks={sinks} onChange={saved(setSinks)} max={maxSinks} />
      <BranchesDialog
        open={open === "branches"}
        onOpenChange={toggle("branches")}
        saved={branches}
        onSaved={saved(setBranches)}
        max={maxBranches}
      />
    </div>
  )
}
