"use client"

import { Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { CatalogDialog } from "@/components/catalog-dialog"
import { PageHeader } from "@/components/page-header"
import { ImportRulesDialog } from "@/components/import-rules-dialog"
import { AI_EXAMPLE_PACKS, aiExamples } from "@/lib/rules/ai-examples"
import { SEVERITIES, type Severity } from "@/schemas/rule"
import type { AiRule } from "@/schemas/ai-rule"

const LEVELS = [...SEVERITIES].reverse()

export function RulesActions({
  onNewPattern,
  onNewAi,
}: {
  onNewPattern: () => void
  onNewAi: (from?: AiRule) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CatalogDialog
        label="AI examples"
        rules={aiExamples.map((rule) => ({ ...rule, pack: "ai-examples" }))}
        packs={[...AI_EXAMPLE_PACKS]}
        onSelect={(rule) => onNewAi({ ...rule, id: rule.id.replace(/^example-/, "") })}
      />
      <ImportRulesDialog />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm">
            <Plus />
            New rule
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onNewPattern}>Pattern rule</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onNewAi()}>AI rule</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function RulesFilter({
  query,
  onQuery,
  severities,
  onSeverities,
}: {
  query: string
  onQuery: (query: string) => void
  severities: Set<Severity>
  onSeverities: (next: Set<Severity>) => void
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative sm:max-w-xs sm:flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search rules" aria-label="Search rules" className="pl-8" />
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by severity">
        {LEVELS.map((level) => {
          const on = severities.has(level)
          return (
            <Button
              key={level}
              type="button"
              size="xs"
              variant={on ? "secondary" : "outline"}
              aria-pressed={on}
              className={on ? "" : "text-muted-foreground"}
              onClick={() => {
                const next = new Set(severities)
                if (on) next.delete(level)
                else next.add(level)
                onSeverities(next)
              }}
            >
              {level}
            </Button>
          )
        })}
      </div>
    </div>
  )
}

const noop = () => {}

// The real header and filter, inert, so the loading state has the page's exact shape.
export function RulesToolbarPlaceholder() {
  return (
    <>
      <PageHeader
        title="Rules"
        actions={
          <fieldset disabled>
            <RulesActions onNewPattern={noop} onNewAi={noop} />
          </fieldset>
        }
      />
      <fieldset disabled className="min-w-0">
        <RulesFilter query="" onQuery={noop} severities={new Set()} onSeverities={noop} />
      </fieldset>
    </>
  )
}
