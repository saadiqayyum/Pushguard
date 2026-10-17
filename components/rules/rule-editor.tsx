"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { AdvancedEditor } from "@/components/rules/advanced-editor"
import { GroupEditor } from "@/components/rules/group-editor"
import { ScopeSection } from "@/components/rules/scope-section"
import { TestPanel } from "@/components/rules/test-panel"
import { ThenSection } from "@/components/rules/then-section"
import type { ScopeOption } from "@/components/scope-select"
import { draftToRule, type Draft, type DraftErrors } from "@/lib/rules/draft"
import { slugify } from "@/lib/rules/summary"

// Missing-value errors wait for a save attempt; malformed input shows as soon as it is typed.
const GATED = /^g\d+(\.(all_of|paths|exclude_paths|added_lines|commit_message|change_type|when))?$/

export function useRuleDraft(init: () => Draft, idSettled: boolean) {
  const [draft, setDraft] = useState<Draft>(init)
  const [idTouched, setIdTouched] = useState(idSettled)
  const [remote, setRemote] = useState<DraftErrors>({})
  const [attempted, setAttempted] = useState(false)

  const built = useMemo(() => draftToRule(draft), [draft])
  const live = attempted ? built.errors : Object.fromEntries(Object.entries(built.errors).filter(([key]) => !GATED.test(key)))

  function patch(next: Partial<Draft>) {
    setRemote({})
    setDraft((d) => ({
      ...d,
      ...next,
      ...(!idTouched && next.description !== undefined ? { id: slugify(next.description) } : {}),
    }))
  }

  return {
    draft,
    built,
    errors: { ...live, ...remote },
    invalid: Object.keys(built.errors).length > 0,
    attempted,
    setAttempted,
    setRemote,
    patch,
    touchId: () => setIdTouched(true),
  }
}

export type RuleDraftState = ReturnType<typeof useRuleDraft>

export function RuleIdentity({ state, editing, readOnly }: { state: RuleDraftState; editing: boolean; readOnly: boolean }) {
  const { draft, errors, patch } = state
  const [editingId, setEditingId] = useState(false)
  return (
    <fieldset disabled={readOnly} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="rule-name" className="text-xs text-muted-foreground">
          Name
        </Label>
        <Input id="rule-name" value={draft.description} onChange={(e) => patch({ description: e.target.value })} className="h-10 text-base font-medium" />
      </div>
      {!editing &&
        (editingId || (draft.id && errors.id) ? (
          <div className="space-y-1">
            <Label htmlFor="rule-id" className="text-xs text-muted-foreground">
              ID
            </Label>
            <Input
              id="rule-id"
              value={draft.id}
              aria-invalid={Boolean(draft.id && errors.id)}
              onChange={(e) => {
                state.touchId()
                patch({ id: e.target.value })
              }}
              className="h-8 font-mono text-xs"
            />
            {draft.id && errors.id && <p className="text-xs text-destructive">{errors.id}</p>}
          </div>
        ) : (
          draft.id && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              ID <span className="font-mono">{draft.id}</span>
              <Button type="button" variant="link" size="xs" className="h-auto px-0 text-xs" onClick={() => setEditingId(true)}>
                Edit
              </Button>
            </p>
          )
        ))}
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={draft.enabled} onCheckedChange={(enabled) => patch({ enabled })} />
        Enabled
      </label>
    </fieldset>
  )
}

export function RuleEditor({ state, readOnly, scopeOptions, checks }: { state: RuleDraftState; readOnly: boolean; scopeOptions: ScopeOption[]; checks: string[] }) {
  const { draft, errors, patch } = state
  return (
    <>
      <fieldset disabled={readOnly} className="space-y-5">
        <GroupEditor groups={draft.groups} errors={errors} onChange={(groups) => patch({ groups })} />
        <AdvancedEditor draft={draft.advanced} error={errors.advanced} onChange={(advanced) => patch({ advanced })} />
        <ScopeSection draft={draft} scopeOptions={scopeOptions} error={errors.on ?? errors.repos ?? errors.branches} onChange={patch} />
        <ThenSection severity={draft.severity} then={draft.then} checks={checks} error={errors.responses} onSeverity={(severity) => patch({ severity })} onChange={(then) => patch({ then })} />
      </fieldset>
      <TestPanel rule={state.built.rule} />
    </>
  )
}
