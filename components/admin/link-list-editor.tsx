"use client"

import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Row = Record<string, string | undefined>

// Incidents and references: rows of short text fields, edited in place.
export function LinkListEditor({
  legend,
  addLabel,
  fields,
  rows,
  onChange,
}: {
  legend: string
  addLabel: string
  fields: { key: string; label: string; optional?: boolean }[]
  rows: Row[]
  onChange: (rows: Row[]) => void
}) {
  const set = (i: number, key: string, value: string) =>
    onChange(rows.map((row, j) => (j === i ? { ...row, [key]: value || (fields.find((f) => f.key === key)?.optional ? undefined : "") } : row)))

  return (
    <fieldset className="space-y-3">
      <legend className="mb-3 text-sm font-medium">{legend}</legend>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No {legend.toLowerCase()}</p>}
      {rows.map((row, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center">
          {fields.map((field) => (
            <Input
              key={field.key}
              aria-label={`${legend} ${i + 1} ${field.label}`}
              placeholder={field.label}
              value={row[field.key] ?? ""}
              onChange={(e) => set(i, field.key, e.target.value)}
              className={field.key === "url" ? "h-8 font-mono text-xs sm:flex-[2]" : "h-8 sm:flex-1"}
            />
          ))}
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${legend.toLowerCase()} ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-dashed"
        onClick={() => onChange([...rows, Object.fromEntries(fields.filter((f) => !f.optional).map((f) => [f.key, ""]))])}
      >
        <Plus className="size-4" aria-hidden />
        {addLabel}
      </Button>
    </fieldset>
  )
}
