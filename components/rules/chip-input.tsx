"use client"

import { Fragment, useId, useState } from "react"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { OPERATOR_LABELS, OPERATORS, type Operand, type Operator } from "@/lib/rules/operators"
import { cn } from "@/lib/utils"

const COLLAPSED_CHIPS = 6

export type ChipOperators = {
  initial: Operator
  compile: (operand: Operand) => string
  parse: (stored: string) => Operand
}

export function Joiner({ word }: { word: string }) {
  return <span className="px-0.5 text-xs text-muted-foreground">{word}</span>
}

// With operators, chips hold the compiled pattern and show it read back as "op value";
// only "matches" passes raw input through, so only it is validated.
export function ChipInput({
  values,
  onChange,
  label,
  placeholder,
  joiner = "or",
  mono = false,
  operators,
  validate,
  errorAt,
}: {
  values: string[]
  onChange: (next: string[]) => void
  label: string
  placeholder?: string
  joiner?: string
  mono?: boolean
  operators?: ChipOperators
  validate?: (value: string) => string | undefined
  errorAt?: (index: number) => string | undefined
}) {
  const [text, setText] = useState("")
  const [op, setOp] = useState<Operator>(operators?.initial ?? "matches")
  const [expanded, setExpanded] = useState(false)
  const [chosen, setChosen] = useState<Record<string, Operator>>({})
  const hintId = useId()
  const raw = !operators || op === "matches"
  const live = text && raw ? validate?.(text) : undefined
  const chipErrors = values.flatMap((value, i) => {
    const error = errorAt?.(i)
    return error ? [`${value}: ${error}`] : []
  })
  const hidden = expanded ? 0 : Math.max(0, values.length - COLLAPSED_CHIPS)
  const shown = hidden ? values.slice(0, COLLAPSED_CHIPS) : values

  function add() {
    const value = text.trim()
    if (!value || live) return
    const stored = operators ? operators.compile({ op, value }) : value
    if (!values.includes(stored)) onChange([...values, stored])
    if (operators) setChosen((prev) => ({ ...prev, [stored]: op }))
    setText("")
  }

  return (
    <div className="min-w-0 space-y-2">
      {values.length > 0 && (
        <ul className="flex flex-wrap items-center gap-1.5" aria-label={label}>
          {shown.map((value, i) => {
            const operand = operators && (chosen[value] === "matches" ? { op: "matches" as const, value } : operators.parse(value))
            return (
              <Fragment key={value}>
                {i > 0 && <Joiner word={joiner} />}
                <li
                  className={cn(
                    "inline-flex max-w-full items-center gap-1 rounded-md border bg-muted/40 py-0.5 pr-0.5 pl-2 text-xs",
                    errorAt?.(i) && "border-destructive text-destructive",
                  )}
                >
                  {operand && <span className="shrink-0 text-muted-foreground">{OPERATOR_LABELS[operand.op]}</span>}
                  <span className={cn("truncate", (mono || operand) && "font-mono")} aria-invalid={Boolean(errorAt?.(i))}>
                    {operand ? operand.value : value}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${operand ? `${OPERATOR_LABELS[operand.op]} ${operand.value}` : value}`}
                    onClick={() => onChange(values.filter((v) => v !== value))}
                  >
                    <X />
                  </Button>
                </li>
              </Fragment>
            )
          })}
          {values.length > COLLAPSED_CHIPS && (
            <li>
              <Button type="button" variant="ghost" size="xs" className="text-muted-foreground" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
                {expanded ? "Show fewer" : `+${hidden} more`}
              </Button>
            </li>
          )}
        </ul>
      )}
      <div className="flex items-center gap-1.5">
        {operators && (
          <Select value={op} onValueChange={(next) => setOp(next as Operator)}>
            <SelectTrigger size="sm" className="h-8 w-32 shrink-0" aria-label={`Operator for new ${label}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OPERATORS.map((o) => (
                <SelectItem key={o} value={o}>
                  {OPERATOR_LABELS[o]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input
          value={text}
          aria-label={`New ${label}`}
          aria-invalid={Boolean(live)}
          aria-describedby={live ? hintId : undefined}
          placeholder={placeholder}
          spellCheck={false}
          className={cn("h-8 min-w-0 placeholder:font-sans", (mono || operators) && "font-mono text-xs")}
          onChange={(event) => setText(event.target.value)}
          onBlur={add}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              add()
            } else if (event.key === "Backspace" && !text && values.length) {
              onChange(values.slice(0, -1))
            }
          }}
        />
        <Button type="button" variant="outline" size="icon-sm" aria-label={`Add ${label}`} onClick={add} disabled={!text.trim() || Boolean(live)}>
          <Plus />
        </Button>
      </div>
      {live && (
        <p id={hintId} className="text-xs text-destructive">
          {live}
        </p>
      )}
      {chipErrors.map((error) => (
        <p key={error} className="text-xs break-words text-destructive">
          {error}
        </p>
      ))}
    </div>
  )
}
