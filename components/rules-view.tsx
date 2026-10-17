"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { AiRuleForm, type AiRuleFormMode } from "@/components/ai-rule-form"
import type { CatalogPack } from "@/components/catalog-dialog"
import { PageHeader } from "@/components/page-header"
import { RuleForm, type RuleFormMode } from "@/components/rule-form"
import type { RuleRow } from "@/components/rule-types"
import { RuleLine, RuleSection, ruleName, ruleSummary } from "@/components/rules/rule-section"
import { RulesActions, RulesFilter } from "@/components/rules/rules-toolbar"
import type { ScopeOption } from "@/components/scope-select"
import { api, ApiClientError } from "@/lib/api-client"
import type { Severity } from "@/schemas/rule"

type Section = { id: string; title: string; rows: RuleRow[]; pack?: boolean }

const failure = (error: unknown) => (error instanceof ApiClientError ? error.message : "Update failed")

export function RulesView({
  initialRules,
  disabledPacks,
  catalogOff,
  catalogPacks,
  aiKeys,
  loadError,
  scopeOptions,
  checks,
  readOnly = false,
}: {
  initialRules: RuleRow[]
  disabledPacks: string[]
  catalogOff: string[]
  catalogPacks: CatalogPack[]
  aiKeys: { id: string; label: string; model: string }[]
  loadError: boolean
  scopeOptions: ScopeOption[]
  checks: string[]
  readOnly?: boolean
}) {
  const router = useRouter()
  const [source, setSource] = useState({ initialRules, disabledPacks })
  const [rows, setRows] = useState(initialRules)
  const [packsOff, setPacksOff] = useState(new Set(disabledPacks))
  if (source.initialRules !== initialRules || source.disabledPacks !== disabledPacks) {
    setSource({ initialRules, disabledPacks })
    setRows(initialRules)
    setPacksOff(new Set(disabledPacks))
  }
  const [query, setQuery] = useState("")
  const [severities, setSeverities] = useState<Set<Severity>>(new Set())
  const [open, setOpen] = useState<Set<string>>(new Set(["custom", "ai"]))
  const [mode, setMode] = useState<RuleFormMode | null>(null)
  const [aiMode, setAiMode] = useState<AiRuleFormMode | null>(null)
  const [opened, setOpened] = useState(0)

  const sections: Section[] = [
    { id: "custom", title: "Custom", rows: rows.filter((r) => r.kind === "pattern" && r.origin === "custom") },
    { id: "ai", title: "AI rules", rows: rows.filter((r) => r.kind === "ai") },
    ...catalogPacks.map((p) => ({ id: p.id, title: p.title, pack: true, rows: rows.filter((r) => r.kind === "pattern" && r.origin !== "custom" && r.pack === p.id) })),
  ]
  const needle = query.trim().toLowerCase()
  const filtering = Boolean(needle) || severities.size > 0
  const visible = (row: RuleRow) =>
    (severities.size === 0 || severities.has(row.body.severity)) &&
    (!needle || `${row.ruleId} ${ruleName(row)} ${ruleSummary(row)}`.toLowerCase().includes(needle))
  const shown = sections
    .map((s) => ({ ...s, hits: s.rows.filter(visible) }))
    .filter((s) => !filtering || s.hits.length > 0)
    .filter((s) => !s.pack || s.rows.length > 0)

  function onQuery(next: string) {
    setQuery(next)
    const q = next.trim().toLowerCase()
    if (q) setOpen(new Set(sections.filter((s) => s.rows.some((r) => `${r.ruleId} ${ruleName(r)} ${ruleSummary(r)}`.toLowerCase().includes(q))).map((s) => s.id)))
  }

  function openEditor(next: RuleFormMode | null, ai: AiRuleFormMode | null = null) {
    setMode(next)
    setAiMode(ai)
    setOpened((n) => n + 1)
  }

  function upsert(row: RuleRow) {
    setRows((prev) => (prev.some((r) => r.id === row.id) ? prev.map((r) => (r.id === row.id ? row : r)) : [...prev, row]))
  }

  async function toggleRule(row: RuleRow, enabled: boolean) {
    upsert({ ...row, enabled } as RuleRow)
    try {
      if (row.kind === "ai") await api(`/api/ai-rules/${row.ruleId}`, { method: "PATCH", body: { ...row.body, enabled } })
      else await api(`/api/rules/${row.id}`, { method: "PATCH", body: { enabled } })
    } catch (error) {
      upsert(row)
      toast.error(failure(error))
    }
  }

  async function togglePack(pack: string, enabled: boolean) {
    const before = { rows, packsOff }
    const off = new Set(packsOff)
    if (enabled) off.delete(pack)
    else off.add(pack)
    setPacksOff(off)
    setRows((prev) => prev.map((r) => (r.origin === "catalog" && r.pack === pack ? { ...r, enabled: enabled && !catalogOff.includes(r.id) } : r)))
    try {
      await api(`/api/rules/packs/${pack}`, { method: "PATCH", body: { enabled } })
    } catch (error) {
      setRows(before.rows)
      setPacksOff(before.packsOff)
      toast.error(failure(error))
    }
  }

  const close = () => openEditor(null)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rules"
        description={readOnly ? "Read only" : undefined}
        actions={!readOnly && <RulesActions onNewPattern={() => openEditor({ kind: "create" })} onNewAi={(from) => openEditor(null, { kind: "create", from })} />}
      />

      <RulesFilter query={query} onQuery={onQuery} severities={severities} onSeverities={setSeverities} />

      {loadError && (
        <Alert>
          <AlertTriangle />
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Could not load rules
            <Button variant="outline" size="xs" onClick={() => router.refresh()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {shown.length === 0 ? (
        <div className="rounded-lg border py-12 text-center">
          <p className="text-sm text-muted-foreground">No rules match</p>
          <Button variant="link" size="sm" onClick={() => (onQuery(""), setSeverities(new Set()))}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border">
          {shown.map((section) => (
            <RuleSection
              key={section.id}
              title={section.title}
              meta={`${section.rows.length} rule${section.rows.length === 1 ? "" : "s"} · ${section.rows.filter((r) => r.enabled).length} on`}
              open={open.has(section.id)}
              onOpenChange={(isOpen) => setOpen((prev) => (isOpen ? new Set(prev).add(section.id) : new Set([...prev].filter((id) => id !== section.id))))}
              enabled={section.pack ? !packsOff.has(section.id) : undefined}
              onEnabledChange={section.pack ? (on) => togglePack(section.id, on) : undefined}
              onCreate={section.pack ? undefined : () => (section.id === "ai" ? openEditor(null, { kind: "create" }) : openEditor({ kind: "create" }))}
              createLabel={section.id === "ai" ? "New AI rule" : "New custom rule"}
              readOnly={readOnly}
            >
              {section.hits.length === 0 && (
                <li className="py-2 pr-4 pl-9 text-sm text-muted-foreground">{section.id === "ai" ? "No AI rules" : "No custom rules"}</li>
              )}
              {section.hits.map((row) => (
                <RuleLine
                  key={row.id}
                  row={row}
                  readOnly={readOnly}
                  locked={row.origin === "catalog" && row.pack !== null && packsOff.has(row.pack)}
                  onOpen={() => (row.kind === "ai" ? openEditor(null, { kind: "edit", rule: row.body }) : openEditor({ kind: "edit", row }))}
                  onToggle={(on) => toggleRule(row, on)}
                />
              ))}
            </RuleSection>
          ))}
        </div>
      )}

      <Sheet open={mode !== null || aiMode !== null} onOpenChange={(isOpen) => !isOpen && close()}>
        <SheetContent aria-describedby={undefined} className="w-full! gap-0 p-0 sm:max-w-2xl!">
          {mode && (
            <RuleForm
              key={opened}
              mode={mode}
              readOnly={readOnly}
              scopeOptions={scopeOptions}
              checks={checks}
              onClose={close}
              onSaved={(row) => (upsert(row), close())}
              onRemoved={(id, restored) => {
                if (restored) upsert(restored)
                else setRows((prev) => prev.filter((r) => r.id !== id))
                close()
              }}
              onDuplicate={(rule) => openEditor({ kind: "create", from: { ...rule, pack: undefined, id: `${rule.id}-copy`.slice(0, 64) } })}
            />
          )}
          {aiMode && (
            <>
              <SheetTitle className="border-b p-4 pr-12 text-sm font-normal text-muted-foreground sm:px-6">
                {aiMode.kind === "edit" ? <span className="font-mono">{aiMode.rule.id}</span> : "New AI rule"}
                {readOnly && " · read only"}
              </SheetTitle>
              <fieldset disabled={readOnly} className="min-h-0 flex-1 overflow-y-auto p-4 sm:px-6">
                <AiRuleForm
                  key={opened}
                  mode={aiMode}
                  keys={aiKeys}
                  onSaved={() => {
                    close()
                    router.refresh()
                  }}
                />
              </fieldset>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
