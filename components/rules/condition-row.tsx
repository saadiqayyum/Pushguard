"use client"

import { Fragment } from "react"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChipInput, Joiner } from "@/components/rules/chip-input"
import { blankRow, FIELD_LABELS, regexError, WHEN_FLAGS, type Field, type Row } from "@/lib/rules/draft"
import type { HourOp } from "@/lib/rules/draft-advanced"
import { fromGlob, fromRegex, toGlob, toRegex } from "@/lib/rules/operators"
import { CHANGE_TYPES, MAX_FILE_SETS } from "@/schemas/rule"

export const FIELD_OPTIONS = (Object.keys(FIELD_LABELS) as Field[]).map((value) => ({ value, label: FIELD_LABELS[value] }))

const HOURS = Array.from({ length: 24 }, (_, h) => h)

export const freeField = (field: Field, used: Set<Field>): Field | null => (used.has(field) ? null : field)

export function ConditionRow({
  row,
  used,
  errorAt,
  autoFocus,
  onChange,
  onRemove,
}: {
  row: Row
  used: Set<Field>
  errorAt: (suffix: string) => string | undefined
  autoFocus?: boolean
  onChange: (row: Row) => void
  onRemove: () => void
}) {
  const others = new Set([...used].filter((f) => f !== row.field))
  const rowError = errorAt(row.field)

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(8rem,11rem)_minmax(0,1fr)_auto] sm:items-start">
        <Select
          value={row.field}
          onValueChange={(value) => {
            const field = freeField(value as Field, others)
            if (field) onChange({ ...blankRow(field), key: row.key })
          }}
        >
          <SelectTrigger size="sm" className="h-8 w-full" aria-label="Condition field" autoFocus={autoFocus}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_OPTIONS.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                title={option.value === "added_lines" ? "A line this push adds" : undefined}
                disabled={row.field !== option.value && !freeField(option.value, others)}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="col-start-2 row-start-1 sm:col-start-3"
          aria-label="Remove condition"
          onClick={onRemove}
        >
          <X />
        </Button>
        <div className="col-span-2 min-w-0 space-y-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
          <Operator row={row} onChange={onChange} />
          <Values row={row} errorAt={errorAt} onChange={onChange} />
          {rowError && <p className="text-xs text-destructive">{rowError}</p>}
        </div>
    </div>
  )
}

export function HourOpSelect({ op, onChange }: { op: HourOp; onChange: (op: HourOp) => void }) {
  return (
    <Select value={op} onValueChange={(next) => onChange(next as HourOp)}>
      <SelectTrigger size="sm" className="h-8 w-36" aria-label="Time operator">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="between">between</SelectItem>
        <SelectItem value="not_between">not between</SelectItem>
      </SelectContent>
    </Select>
  )
}

export function HourRange({ range, onChange }: { range: [number, number]; onChange: (range: [number, number]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {([0, 1] as const).map((end) => (
        <Fragment key={end}>
          {end === 1 && <Joiner word="and" />}
          <Select value={String(range[end])} onValueChange={(h) => onChange(end === 0 ? [Number(h), range[1]] : [range[0], Number(h)])}>
            <SelectTrigger size="sm" className="w-24" aria-label={end === 0 ? "From hour" : "To hour"}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => (
                <SelectItem key={h} value={String(h)}>
                  {String(h).padStart(2, "0")}:00
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Fragment>
      ))}
    </div>
  )
}

function Operator({ row, onChange }: { row: Row; onChange: (row: Row) => void }) {
  return row.field === "hour_utc" ? <HourOpSelect op={row.op} onChange={(op) => onChange({ ...row, op })} /> : null
}

function Values({ row, errorAt, onChange }: { row: Row; errorAt: (suffix: string) => string | undefined; onChange: (row: Row) => void }) {
  switch (row.field) {
    case "paths":
    case "exclude_paths":
      return (
        <ChipInput
          label="file path"
          placeholder="Add a path"
          values={row.values}
          operators={{ initial: "equals", compile: toGlob, parse: fromGlob }}
          onChange={(values) => onChange({ ...row, values })}
        />
      )
    case "added_lines":
    case "commit_message":
      return (
        <ChipInput
          label={row.field === "added_lines" ? "new code text" : "commit message text"}
          placeholder="Add text"
          values={row.values}
          operators={{ initial: "contains", compile: toRegex, parse: fromRegex }}
          validate={regexError}
          errorAt={(i) => errorAt(`${row.field}.${i}`)}
          onChange={(values) => onChange({ ...row, values })}
        />
      )
    case "change_type":
      return (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Change types">
          {CHANGE_TYPES.map((type, i) => {
            const on = row.values.includes(type)
            return (
              <Fragment key={type}>
                {i > 0 && <Joiner word="or" />}
                <Button
                  type="button"
                  size="xs"
                  variant={on ? "secondary" : "outline"}
                  aria-pressed={on}
                  className={on ? "" : "text-muted-foreground"}
                  onClick={() => onChange({ ...row, values: on ? row.values.filter((t) => t !== type) : CHANGE_TYPES.filter((t) => t === type || row.values.includes(t)) })}
                >
                  {type}
                </Button>
              </Fragment>
            )
          })}
        </div>
      )
    case "unicode_risk":
      return (
        <Select value={row.value} onValueChange={(value) => onChange({ ...row, value: value as typeof row.value })}>
          <SelectTrigger size="sm" className="w-full sm:max-w-sm" aria-label="Hidden character kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="controls">Control and invisible characters</SelectItem>
            <SelectItem value="confusables">Control characters and lookalikes</SelectItem>
          </SelectContent>
        </Select>
      )
    case "when": {
      const remaining = WHEN_FLAGS.filter(({ flag }) => !row.flags.some((f) => f.flag === flag))
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {row.flags.map(({ flag, value }, i) => {
            const label = WHEN_FLAGS.find((f) => f.flag === flag)!.label
            const text = value ? label : `not ${label}`
            return (
              <Fragment key={flag}>
                {i > 0 && <Joiner word="and" />}
                <span className="inline-flex items-center rounded-md border bg-muted/40 text-xs">
                  <button
                    type="button"
                    className="rounded-l-md py-0.5 pl-2 pr-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`${text}, select to negate`}
                    onClick={() => onChange({ ...row, flags: row.flags.map((f) => (f.flag === flag ? { flag, value: !value } : f)) })}
                  >
                    {text}
                  </button>
                  <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${text}`} onClick={() => onChange({ ...row, flags: row.flags.filter((f) => f.flag !== flag) })}>
                    <X />
                  </Button>
                </span>
              </Fragment>
            )
          })}
          {remaining.length > 0 && (
            <Select value="" onValueChange={(flag) => onChange({ ...row, flags: [...row.flags, { flag: flag as (typeof remaining)[number]["flag"], value: true }] })}>
              <SelectTrigger size="sm" className="h-7 w-auto gap-1 border-dashed text-xs" aria-label="Add push condition">
                <Plus className="size-3.5" />
                <span>Add</span>
              </SelectTrigger>
              <SelectContent>
                {remaining.map(({ flag, label }) => (
                  <SelectItem key={flag} value={flag}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )
    }
    case "hour_utc":
      return <HourRange range={row.range} onChange={(range) => onChange({ ...row, range })} />
    case "all_of":
      return (
        <div className="space-y-2">
          {row.sets.map((set, i) => (
            <Fragment key={i}>
              {i > 0 && <Joiner word="and" />}
              <div className="flex items-start gap-1.5">
                <div className="min-w-0 flex-1">
                  <ChipInput
                    label={`file set ${i + 1} path`}
                    placeholder="Add a path"
                    operators={{ initial: "equals", compile: toGlob, parse: fromGlob }}
                    values={set}
                    onChange={(next) => onChange({ ...row, sets: row.sets.map((s, j) => (j === i ? next : s)) })}
                  />
                </div>
                {row.sets.length > 2 && (
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove file set ${i + 1}`} onClick={() => onChange({ ...row, sets: row.sets.filter((_, j) => j !== i) })}>
                    <X />
                  </Button>
                )}
              </div>
            </Fragment>
          ))}
          {row.sets.length < MAX_FILE_SETS && (
            <Button type="button" variant="ghost" size="xs" onClick={() => onChange({ ...row, sets: [...row.sets, []] })}>
              <Plus />
              Add file set
            </Button>
          )}
        </div>
      )
  }
}
