"use client"

import { useState } from "react"
import { AlertTriangle, Copy, MoreHorizontal, Pencil, Plus } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Pager } from "@/components/pager"
import type { ScopeOption } from "@/components/scope-select"
import { RuleForm, type RuleFormMode } from "@/components/rule-form"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { api, ApiClientError } from "@/lib/api-client"
import type { Rule, Severity } from "@/schemas/rule"
import type { RuleRow } from "@/components/rule-types"

const SEVERITY_VARIANT: Record<Severity, "destructive" | "default" | "secondary" | "outline"> = {
  critical: "destructive",
  high: "default",
  medium: "secondary",
  low: "outline",
}

export function RulesView({
  orgs,
  initialRules,
  loadError,
  paging,
  scopeOptions,
}: {
  orgs: string[]
  initialRules: RuleRow[]
  loadError: boolean
  paging: { page: number; perPage: number; total: number; hasMore: boolean }
  scopeOptions: ScopeOption[]
}) {
  const [rows, setRows] = useState(initialRules)
  const [mode, setMode] = useState<RuleFormMode | null>(null)

  function onSaved(row: RuleRow, saved: RuleFormMode) {
    setRows((prev) =>
      saved.kind === "edit" ? prev.map((r) => (r.id === row.id ? row : r)) : [...prev, row],
    )
    setMode(null)
  }

  async function toggleRule(row: RuleRow, enabled: boolean) {
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, enabled } : r)))
    try {
      await api(`/api/rules/${row.id}`, { method: "PATCH", body: { enabled } })
      toast.success(`Rule ${row.ruleId} ${enabled ? "enabled" : "disabled"}`)
    } catch (error) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, enabled: !enabled } : r)))
      toast.error(error instanceof ApiClientError ? error.message : "Update failed")
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Rules</h1>
          <p className="text-sm text-muted-foreground">
            One rule set for your account, evaluated against every push to{" "}
            {orgs.length > 1 ? `all ${orgs.length} organizations` : orgs[0]}. Narrow an individual
            rule with its repository patterns.
          </p>
        </div>
        <Button size="sm" onClick={() => setMode({ kind: "create" })}>
          <Plus className="size-4" />
          New rule
        </Button>
      </div>

      {loadError && (
        <Card>
          <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
            <AlertTriangle className="size-4" />
            Could not load rules. Check the database configuration on the settings page.
          </CardContent>
        </Card>
      )}

      <div className="rounded-lg border">
        {/* Five columns do not fit a phone; scroll the table instead of
            crushing every column to unreadable width. */}
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead>Rule</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Conditions</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Enabled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  No rules yet. Create one to start detecting.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => {
              const rule = row.body as { severity?: Severity; description?: string } & Record<string, unknown>
              return (
                <TableRow key={row.id}>
                  <TableCell>
                    <p className="font-medium">{row.ruleId}</p>
                    {rule.description ? (
                      <p className="max-w-md truncate text-xs text-muted-foreground">{rule.description}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant={SEVERITY_VARIANT[rule.severity ?? "low"]}>{rule.severity}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{conditionSummary(rule)}</TableCell>
                  {/* Locale-independent: toLocaleDateString() renders in the
                      server's locale during SSR and the browser's on hydration,
                      which React reports as a hydration mismatch. */}
                  <TableCell className="text-xs text-muted-foreground">
                    {row.updatedAt.slice(0, 10)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Switch checked={row.enabled} onCheckedChange={(v) => toggleRule(row, v)} />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.ruleId}`}>
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() =>
                              setMode({ kind: "edit", docId: row.id, rule: row.body as Rule })
                            }
                          >
                            <Pencil className="size-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => setMode({ kind: "duplicate", rule: row.body as Rule })}
                          >
                            <Copy className="size-4" />
                            Duplicate
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <Pager
        page={paging.page}
        perPage={paging.perPage}
        total={paging.total}
        hasMore={paging.hasMore}
        basePath="/rules"
      />

      {/* Keyed so switching between rules remounts the form with fresh state
          instead of keeping the previous rule's values. */}
      <Dialog open={mode !== null} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent
          // Both max-w forms are needed: the base sets an unprefixed
          // max-w-[calc(100%-2rem)] that a bare sm: override does not replace,
          // which is what made this dialog span the whole viewport.
          className="max-h-[85vh] w-[calc(100%-2rem)] max-w-3xl gap-6 overflow-y-auto p-6 sm:max-w-3xl"
        >
          <DialogHeader>
            <DialogTitle>
              {mode?.kind === "edit"
                ? `Edit ${mode.rule.id}`
                : mode?.kind === "duplicate"
                  ? `Duplicate ${mode.rule.id}`
                  : "New rule"}
            </DialogTitle>
          </DialogHeader>
          {mode && (
            <RuleForm
              key={mode.kind === "create" ? "create" : `${mode.kind}:${mode.rule.id}`}
              mode={mode}
              scopeOptions={scopeOptions}
              onSaved={onSaved}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function conditionSummary(rule: Record<string, unknown>): string {
  const parts: string[] = []
  if (rule.when) parts.push("payload")
  if (rule.paths) parts.push(`paths (${(rule.paths as string[]).length})`)
  if (rule.added_lines) parts.push("diff regex")
  if (rule.ai) parts.push("ai review")
  return parts.join(" · ") || "none"
}
