"use client"

import { ChevronRight, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SeverityBadge } from "@/components/severity-badge"
import type { RuleRow } from "@/components/rule-types"
import { humanize, summarize } from "@/lib/rules/summary"

export function ruleName(row: RuleRow): string {
  return row.body.description || humanize(row.ruleId)
}

export function ruleSummary(row: RuleRow): string {
  if (row.kind === "ai") return row.body.paths?.length ? `AI review · ${row.body.paths[0]}` : "AI review"
  return summarize(row.body)
}

export function RuleSection({
  title,
  meta,
  open,
  onOpenChange,
  enabled,
  onEnabledChange,
  onCreate,
  createLabel,
  readOnly,
  children,
}: {
  title: string
  meta: string
  open: boolean
  onOpenChange: (open: boolean) => void
  enabled?: boolean
  onEnabledChange?: (enabled: boolean) => void
  onCreate?: () => void
  createLabel?: string
  readOnly: boolean
  children: React.ReactNode
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="border-b last:border-b-0">
      <div className="flex items-center gap-3 px-3 sm:px-4">
        <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-2 rounded-md py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
          <span className="truncate text-sm font-medium">{title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>
        </CollapsibleTrigger>
        {onEnabledChange && (
          <Switch checked={enabled} disabled={readOnly} aria-label={`${title} pack enabled`} onCheckedChange={onEnabledChange} />
        )}
        {onCreate && !readOnly && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-xs" className="w-8" aria-label={createLabel} onClick={onCreate}>
                <Plus />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{createLabel}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <CollapsibleContent>
        <ul className="pb-2">{children}</ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function RuleLine({
  row,
  readOnly,
  locked,
  onOpen,
  onToggle,
  badge,
}: {
  row: RuleRow
  readOnly: boolean
  locked: boolean
  onOpen: () => void
  onToggle?: (enabled: boolean) => void
  badge?: React.ReactNode
}) {
  const name = ruleName(row)
  const summary = ruleSummary(row)
  return (
    <li className="flex items-center gap-3 px-3 sm:px-4">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md py-2 pl-6 text-left outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:gap-3"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm">{name}</span>
          {row.origin === "modified" && <span className="shrink-0 text-xs text-muted-foreground">edited</span>}
        </span>
        <span className="flex min-w-0 items-center gap-2 sm:ml-auto">
          {summary && <span className="truncate text-xs text-muted-foreground">{summary}</span>}
          <SeverityBadge severity={row.body.severity} className="shrink-0" />
          {badge}
        </span>
      </button>
      {onToggle && <Switch checked={row.enabled} disabled={readOnly || locked} aria-label={`${name} enabled`} onCheckedChange={onToggle} />}
    </li>
  )
}
