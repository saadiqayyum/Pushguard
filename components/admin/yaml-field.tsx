"use client"

import { useState } from "react"
import { parse, stringify } from "yaml"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

// Edits one value as YAML. The parent only sees a value once it parses.
export function YamlField({
  id,
  label,
  value,
  onChange,
  rows = 10,
}: {
  id: string
  label: string
  value: unknown
  onChange: (value: unknown) => void
  rows?: number
}) {
  const [text, setText] = useState(() => (value === undefined ? "" : stringify(value)))
  const [error, setError] = useState<string | null>(null)

  function update(next: string) {
    setText(next)
    try {
      onChange(next.trim() === "" ? undefined : parse(next))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : "Invalid YAML")
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={text}
        onChange={(e) => update(e.target.value)}
        rows={rows}
        spellCheck={false}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className="font-mono text-xs"
      />
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
