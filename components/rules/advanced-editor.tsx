"use client"

import { Fragment } from "react"
import { Plus, X } from "lucide-react"
import { stringify } from "yaml"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Joiner } from "@/components/rules/chip-input"
import { HourOpSelect, HourRange } from "@/components/rules/condition-row"
import {
  ADVANCED_LABELS,
  blankAdvancedRow,
  FACT_KINDS,
  FACT_LABELS,
  INDICATOR_KINDS,
  INDICATOR_LABELS,
  type AdvancedDraft,
  type AdvancedKind,
  type AdvancedRow,
} from "@/lib/rules/draft-advanced"
import { MAX_WITHIN_DAYS } from "@/schemas/rule-advanced"

const KINDS = Object.keys(ADVANCED_LABELS) as AdvancedKind[]
const ANY = "any"

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <Button type="button" size="xs" variant={on ? "secondary" : "outline"} aria-pressed={on} className={on ? "" : "text-muted-foreground"} onClick={onClick}>
      {label}
    </Button>
  )
}

function RowValues({ row, onChange }: { row: AdvancedRow; onChange: (row: AdvancedRow) => void }) {
  if (row.kind === "commits") {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Behaviours">
          {FACT_KINDS.map((kind) => {
            const on = row.kinds.includes(kind)
            return <Toggle key={kind} on={on} label={FACT_LABELS[kind]} onClick={() => onChange({ ...row, kinds: on ? row.kinds.filter((k) => k !== kind) : [...row.kinds, kind] })} />
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            Within
            <Input
              type="number"
              min={1}
              max={MAX_WITHIN_DAYS}
              value={row.days}
              onChange={(e) => onChange({ ...row, days: Math.min(MAX_WITHIN_DAYS, Math.max(1, Number(e.target.value) || 1)) })}
              className="h-8 w-20 tabular-nums"
              aria-label="Days"
            />
            days
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={row.sameFile} onCheckedChange={(sameFile) => onChange({ ...row, sameFile })} />
            Same file
          </label>
        </div>
      </div>
    )
  }
  if (row.kind === "contributor") {
    return (
      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <Switch checked={row.firstPush} onCheckedChange={(firstPush) => onChange({ ...row, firstPush })} />
          New contributor
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">
            <Switch checked={row.hours !== null} onCheckedChange={(on) => onChange({ ...row, hours: on ? { op: "not_between", range: [9, 18] } : null })} />
            Time (UTC)
          </label>
          {row.hours && (
            <>
              <HourOpSelect op={row.hours.op} onChange={(op) => onChange({ ...row, hours: { ...row.hours!, op } })} />
              <HourRange range={row.hours.range} onChange={(range) => onChange({ ...row, hours: { ...row.hours!, range } })} />
            </>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Select value={row.indicator || ANY} onValueChange={(v) => onChange({ ...row, indicator: v === ANY ? "" : (v as typeof row.indicator) })}>
        <SelectTrigger size="sm" className="w-full" aria-label="Indicator type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any type</SelectItem>
          {INDICATOR_KINDS.map((kind) => (
            <SelectItem key={kind} value={kind}>
              {INDICATOR_LABELS[kind]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input value={row.campaign} maxLength={100} placeholder="Campaign" aria-label="Campaign" onChange={(e) => onChange({ ...row, campaign: e.target.value })} className="h-8" />
    </div>
  )
}

export function AdvancedEditor({ draft, error, onChange }: { draft: AdvancedDraft; error?: string; onChange: (draft: AdvancedDraft) => void }) {
  const setRow = (row: AdvancedRow) => onChange({ ...draft, rows: draft.rows.map((r) => (r.key === row.key ? row : r)) })

  return (
    <fieldset className="space-y-3">
      <legend className="mb-3 text-sm font-medium">And also</legend>
      {draft.raw ? (
        <div className="flex items-start gap-2 rounded-lg border p-3">
          <pre className="min-w-0 flex-1 overflow-x-auto font-mono text-xs">{stringify(draft.raw)}</pre>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove conditions" onClick={() => onChange({ rows: [], raw: null })}>
            <X />
          </Button>
        </div>
      ) : (
        draft.rows.map((row, i) => (
          <Fragment key={row.key}>
            {i > 0 && <Joiner word="and" />}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(8rem,11rem)_minmax(0,1fr)_auto] sm:items-start sm:p-4">
              <span className="pt-1.5 text-sm">{ADVANCED_LABELS[row.kind]}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="col-start-2 row-start-1 sm:col-start-3"
                aria-label="Remove condition"
                onClick={() => onChange({ ...draft, rows: draft.rows.filter((r) => r.key !== row.key) })}
              >
                <X />
              </Button>
              <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                <RowValues row={row} onChange={setRow} />
              </div>
            </div>
          </Fragment>
        ))
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!draft.raw && (
        <Select value="" onValueChange={(kind) => onChange({ ...draft, rows: [...draft.rows, blankAdvancedRow(kind as AdvancedKind)] })}>
          <SelectTrigger size="sm" className="w-auto gap-1 border-dashed" aria-label="Add condition">
            <Plus className="size-4" />
            <span>Add condition</span>
          </SelectTrigger>
          <SelectContent>
            {KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {ADVANCED_LABELS[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </fieldset>
  )
}
