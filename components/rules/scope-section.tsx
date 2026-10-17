"use client"

import { ChevronRight } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Label } from "@/components/ui/label"
import { ChipInput } from "@/components/rules/chip-input"
import { ScopeSelect, type ScopeOption } from "@/components/scope-select"
import type { ChangeSource, Draft } from "@/lib/rules/draft"

const SOURCES: { value: ChangeSource; label: string }[] = [
  { value: "push", label: "Pushes" },
  { value: "pull_request", label: "Pull requests" },
]

export function ScopeSection({
  draft,
  scopeOptions,
  error,
  onChange,
}: {
  draft: Draft
  scopeOptions: ScopeOption[]
  error?: string
  onChange: (patch: Partial<Draft>) => void
}) {
  const summary = [
    draft.repos.length ? `${draft.repos.length} repos` : "all repos",
    draft.branches.length ? `${draft.branches.length} branches` : "all branches",
    draft.on.length === 1 ? SOURCES.find((s) => s.value === draft.on[0])!.label.toLowerCase() : "pushes and pull requests",
  ].join(", ")

  return (
    <Collapsible defaultOpen={Boolean(error)} className="rounded-lg border">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4">
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
        <span className="font-medium">Applies to</span>
        <span className="ml-auto truncate text-xs text-muted-foreground">{summary}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-5 border-t px-3 py-4 sm:px-4">
        <div className="space-y-2">
          <Label>Repositories</Label>
          <ScopeSelect
            options={scopeOptions}
            selected={draft.repos}
            onChange={(repos) => onChange({ repos })}
            addLabel="Add a repository or organization"
            emptyLabel="Every repository"
          />
        </div>
        <div className="space-y-2">
          <Label>Branches</Label>
          <ChipInput label="branch glob" placeholder="main, release/*" mono values={draft.branches} onChange={(branches) => onChange({ branches })} />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Runs on</legend>
          <div className="flex flex-wrap gap-5 pt-1">
            {SOURCES.map((source) => (
              <label key={source.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={draft.on.includes(source.value)}
                  onCheckedChange={(checked) =>
                    onChange({ on: checked ? SOURCES.map((s) => s.value).filter((v) => v === source.value || draft.on.includes(v)) : draft.on.filter((s) => s !== source.value) })
                  }
                />
                {source.label}
              </label>
            ))}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </fieldset>
      </CollapsibleContent>
    </Collapsible>
  )
}
