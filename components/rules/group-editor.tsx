"use client"

import { Fragment, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConditionRow, FIELD_OPTIONS, freeField } from "@/components/rules/condition-row"
import { blankGroup, blankRow, type DraftErrors, type Field, type Group } from "@/lib/rules/draft"
import { MAX_GROUPS } from "@/schemas/rule"

function Divider({ word }: { word: string }) {
  return (
    <div className="flex items-center gap-3 py-1" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs font-medium text-muted-foreground">{word}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

export function GroupEditor({
  groups,
  errors,
  onChange,
}: {
  groups: Group[]
  errors: DraftErrors
  onChange: (groups: Group[]) => void
}) {
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const setGroup = (gi: number, group: Group) => onChange(groups.map((g, i) => (i === gi ? group : g)))

  return (
    <fieldset className="space-y-3">
      <legend className="mb-3 text-sm font-medium">Match when any group matches</legend>
      {groups.map((group, gi) => {
        const used = new Set<Field>(group.rows.map((r) => r.field))
        const next = FIELD_OPTIONS.map((o) => freeField(o.value, used)).find(Boolean)
        const errorAt = (suffix: string) => errors[`g${gi}.${suffix}`]
        return (
          <Fragment key={group.key}>
            {gi > 0 && <Divider word="OR" />}
            <section aria-label={`Group ${gi + 1}`} className="space-y-3 rounded-lg border p-3 sm:p-4">
              {groups.length > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Group {gi + 1}</span>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove group ${gi + 1}`} onClick={() => onChange(groups.filter((_, i) => i !== gi))}>
                    <Trash2 />
                  </Button>
                </div>
              )}
              {group.rows.map((row, ri) => (
                <Fragment key={row.key}>
                  {ri > 0 && <Divider word="AND" />}
                  <ConditionRow
                    row={row}
                    used={used}
                    errorAt={errorAt}
                    autoFocus={row.key === focusKey}
                    onChange={(r) => setGroup(gi, { ...group, rows: group.rows.map((x) => (x.key === row.key ? r : x)) })}
                    onRemove={() => setGroup(gi, { ...group, rows: group.rows.filter((x) => x.key !== row.key) })}
                  />
                </Fragment>
              ))}
              {errors[`g${gi}`] && <p className="text-xs text-destructive">{errors[`g${gi}`]}</p>}
              {next && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-ml-2.5 text-muted-foreground"
                  onClick={() => {
                    const row = blankRow(next)
                    setFocusKey(row.key)
                    setGroup(gi, { ...group, rows: [...group.rows, row] })
                  }}
                >
                  <Plus />
                  Add condition
                </Button>
              )}
            </section>
          </Fragment>
        )
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={groups.length >= MAX_GROUPS}
        onClick={() => {
          const group = blankGroup()
          setFocusKey(group.rows[0].key)
          onChange([...groups, group])
        }}
      >
        <Plus />
        Add group
      </Button>
    </fieldset>
  )
}
