"use client"

import { useState } from "react"
import { Copy, RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { SheetTitle } from "@/components/ui/sheet"
import { RuleEditor, RuleIdentity, useRuleDraft } from "@/components/rules/rule-editor"
import type { ScopeOption } from "@/components/scope-select"
import type { PatternRow, RuleRow } from "@/components/rule-types"
import { api, ApiClientError } from "@/lib/api-client"
import { blankDraft, ruleToDraft, serverErrors } from "@/lib/rules/draft"
import type { Rule } from "@/schemas/rule"

export type RuleFormMode = { kind: "create"; from?: Rule } | { kind: "edit"; row: PatternRow }

export function RuleForm({
  mode,
  readOnly,
  scopeOptions,
  checks,
  onSaved,
  onRemoved,
  onDuplicate,
  onClose,
}: {
  mode: RuleFormMode
  readOnly: boolean
  scopeOptions: ScopeOption[]
  checks: string[]
  onSaved: (row: RuleRow) => void
  onRemoved: (id: string, restored: RuleRow | null) => void
  onDuplicate: (rule: Rule) => void
  onClose: () => void
}) {
  const editing = mode.kind === "edit" ? mode.row : null
  const state = useRuleDraft(
    () => (editing ? ruleToDraft(editing.body) : mode.kind === "create" && mode.from ? ruleToDraft(mode.from) : blankDraft()),
    Boolean(editing || (mode.kind === "create" && mode.from)),
  )
  const { built, invalid, attempted } = state
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function save() {
    state.setAttempted(true)
    if (!built.rule) return
    setBusy(true)
    try {
      const row = editing
        ? await api<RuleRow>(`/api/rules/${editing.id}`, { method: "PATCH", body: { rule: built.rule, enabled: built.rule.enabled } })
        : await api<RuleRow>("/api/rules", { method: "POST", body: { rule: built.rule } })
      toast.success(editing ? "Rule saved" : "Rule created")
      onSaved(row)
    } catch (cause) {
      const message = cause instanceof ApiClientError ? cause.message : "Save failed"
      const located = serverErrors(message)
      if (located) state.setRemote(located)
      toast.error(located ? "Fix the highlighted fields" : message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!editing) return
    const revert = editing.origin === "modified"
    if (!revert && !confirming) {
      setConfirming(true)
      return
    }
    setBusy(true)
    try {
      const restored = await api<RuleRow | null>(`/api/rules/${editing.id}`, { method: "DELETE" })
      toast.success(revert ? "Reverted to default" : "Rule deleted")
      onRemoved(editing.id, restored)
    } catch (cause) {
      toast.error(cause instanceof ApiClientError ? cause.message : "Request failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="space-y-4 border-b p-4 pr-12 sm:px-6">
        <SheetTitle className="text-sm font-normal text-muted-foreground">
          {editing ? <span className="font-mono">{editing.ruleId}</span> : "New rule"}
          {readOnly && " · read only"}
        </SheetTitle>
        <RuleIdentity state={state} editing={Boolean(editing)} readOnly={readOnly} />
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:px-6">
        <RuleEditor state={state} readOnly={readOnly} scopeOptions={scopeOptions} checks={checks} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t p-4 sm:px-6">
        {editing && !readOnly && (
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => onDuplicate(editing.body)}>
              <Copy />
              Duplicate
            </Button>
            {editing.origin !== "catalog" && (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={remove} className={editing.origin === "custom" ? "text-destructive" : ""}>
                {editing.origin === "custom" ? <Trash2 /> : <RotateCcw />}
                {editing.origin === "custom" ? (confirming ? "Confirm delete" : "Delete") : "Revert to default"}
              </Button>
            )}
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {invalid && attempted && !readOnly && <span className="text-xs text-destructive">Fix the highlighted fields</span>}
          <Button type="button" variant="outline" onClick={onClose}>
            {readOnly ? "Close" : "Cancel"}
          </Button>
          {!readOnly && (
            <Button type="button" onClick={save} disabled={busy} aria-busy={busy}>
              {editing ? "Save" : "Create"}
            </Button>
          )}
        </div>
      </div>
    </>
  )
}
