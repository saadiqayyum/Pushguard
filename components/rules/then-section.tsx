"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { ThenDraft } from "@/lib/rules/draft-advanced"
import { FOCUS_IDS, FOCUS_LABELS, type FocusId } from "@/lib/rules/focus"
import { SEVERITIES, type Severity } from "@/schemas/rule"

const PHASES = [
  { value: "install", label: "Install" },
  { value: "import", label: "Import" },
  { value: "execute", label: "Execute" },
] as const
const NO_CHECK = "none"

function Option({ id, label, checked, onChange, children }: { id: string; label: string; checked: boolean; onChange: (on: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="flex items-center gap-2 text-sm">
        <Checkbox id={id} checked={checked} onCheckedChange={(on) => onChange(on === true)} />
        {label}
      </label>
      {checked && children && <div className="space-y-2 pl-6">{children}</div>}
    </div>
  )
}

export function ThenSection({
  severity,
  then,
  checks,
  error,
  onSeverity,
  onChange,
}: {
  severity: Severity
  then: ThenDraft
  checks: string[]
  error?: string
  onSeverity: (severity: Severity) => void
  onChange: (then: ThenDraft) => void
}) {
  const detonate = then.detonate
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3 text-sm font-medium">Then</legend>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        Alert at
        <Select value={severity} onValueChange={(s) => onSeverity(s as Severity)}>
          <SelectTrigger size="sm" className="w-32" aria-label="Severity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[...SEVERITIES].reverse().map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Option id="then-investigate" label="Ask AI to investigate" checked={then.investigate !== null} onChange={(on) => onChange({ ...then, investigate: on ? { focus: FOCUS_IDS[0] } : null })}>
        <Select value={then.investigate?.focus} onValueChange={(focus) => onChange({ ...then, investigate: { ...then.investigate, focus: focus as FocusId } })}>
          <SelectTrigger size="sm" className="w-full sm:max-w-sm" aria-label="Focus">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FOCUS_IDS.map((id) => (
              <SelectItem key={id} value={id}>
                {FOCUS_LABELS[id]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Option>
      <Option id="then-check" label="Run a check" checked={detonate !== null} onChange={(on) => onChange({ ...then, detonate: on ? { phases: ["install"], check: null } : null })}>
        {detonate && (
          <>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Phases">
              {PHASES.map(({ value, label }) => {
                const on = detonate.phases.includes(value)
                return (
                  <Button
                    key={value}
                    type="button"
                    size="xs"
                    variant={on ? "secondary" : "outline"}
                    aria-pressed={on}
                    className={on ? "" : "text-muted-foreground"}
                    onClick={() => onChange({ ...then, detonate: { ...detonate, phases: PHASES.map((p) => p.value).filter((p) => (p === value ? !on : detonate.phases.includes(p))) } })}
                  >
                    {label}
                  </Button>
                )
              })}
            </div>
            <Select value={detonate.check ?? NO_CHECK} onValueChange={(v) => onChange({ ...then, detonate: { ...detonate, check: v === NO_CHECK ? null : v } })}>
              <SelectTrigger size="sm" className="w-full font-mono text-xs sm:max-w-sm" aria-label="Check">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CHECK}>No check</SelectItem>
                {[...new Set([...checks, ...(detonate.check ? [detonate.check] : [])])].map((id) => (
                  <SelectItem key={id} value={id} className="font-mono text-xs">
                    {id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </Option>
      <Option id="then-meta" label="Alert outside GitHub" checked={then.metaAlert} onChange={(metaAlert) => onChange({ ...then, metaAlert })} />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </fieldset>
  )
}
