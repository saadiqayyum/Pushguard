"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Copy,
  MoreHorizontal,
  Pencil,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pager } from "@/components/pager";
import type { ScopeOption } from "@/components/scope-select";
import { RuleForm, type RuleFormMode } from "@/components/rule-form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, ApiClientError } from "@/lib/api-client";
import type { Rule, Severity } from "@/schemas/rule";
import type { RuleRow } from "@/components/rule-types";
import { ImportRulesDialog } from "@/components/import-rules-dialog";
import { CatalogDialog, type CatalogPack } from "@/components/catalog-dialog";
import { PageHeader } from "@/components/page-header";
import { TableToolbar } from "@/components/table-toolbar";
import { SeverityBadge } from "@/components/severity-badge";
import { TableShell } from "@/components/table-shell";

export function RulesView({
  orgs,
  initialRules,
  catalog,
  catalogPacks,
  catalogActive,
  loadError,
  paging,
  scopeOptions,
}: {
  orgs: string[];
  initialRules: RuleRow[];
  /** Every rule Pushguard ships, for the picker. Not rows in this table. */
  catalog: Rule[];
  catalogPacks: CatalogPack[];
  /** Catalog rules running right now, whether or not anyone has looked at them. */
  catalogActive: number;
  loadError: boolean;
  paging: { page: number; perPage: number; total: number; hasMore: boolean };
  scopeOptions: ScopeOption[];
}) {
  const [rows, setRows] = useState(initialRules);
  const [mode, setMode] = useState<RuleFormMode | null>(null);

  function onSaved(row: RuleRow, saved: RuleFormMode) {
    setRows((prev) =>
      saved.kind === "edit"
        ? prev.map((r) => (r.id === row.id ? row : r))
        : [...prev, row],
    );
    setMode(null);
  }

  async function toggleRule(row: RuleRow, enabled: boolean) {
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, enabled } : r)),
    );
    try {
      await api(`/api/rules/${row.id}`, { method: "PATCH", body: { enabled } });
      toast.success(`Rule ${row.ruleId} ${enabled ? "enabled" : "disabled"}`);
    } catch (error) {
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, enabled: !enabled } : r)),
      );
      toast.error(
        error instanceof ApiClientError ? error.message : "Update failed",
      );
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 space-y-6">
      <PageHeader
        title="Rules"
        description="One rule set for your account, evaluated against every push."
      />

      <TableToolbar
        count={paging.total}
        noun="rule"
        primary={
          <Button size="sm" onClick={() => setMode({ kind: "create" })}>
            <Plus className="size-4" />
            New rule
          </Button>
        }
      >
        <ImportRulesDialog />
        <CatalogDialog
          rules={catalog}
          packs={catalogPacks}
          onSelect={(rule) => setMode({ kind: "duplicate", rule })}
        />
      </TableToolbar>

      {!loadError && initialRules.length === 0 && (
        <Card>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              {catalogActive} catalog rules are running on every push.
            </p>
            <p>
              They ship with Pushguard, so there is nothing to set up. This table lists only rules
              you write or change. Browse the catalog to start your own from one.
            </p>
          </CardContent>
        </Card>
      )}

      {loadError && (
        <Card>
          <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
            <AlertTriangle className="size-4" />
            Could not load rules. The database is unreachable.
          </CardContent>
        </Card>
      )}

      <TableShell>
        <TableHeader>
          <TableRow>
            <TableHead>Rule</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead className="hidden lg:table-cell">Conditions</TableHead>
            <TableHead className="hidden md:table-cell">Updated</TableHead>
            <TableHead className="text-right">Enabled</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-center text-sm text-muted-foreground"
              >
                No rules yet. Create one to start detecting.
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => {
            const rule = row.body as {
              severity?: Severity;
              description?: string;
            } & Record<string, unknown>;
            return (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-medium">{row.ruleId}</p>
                    {row.pack ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {row.pack}
                      </span>
                    ) : null}
                    {row.origin !== "catalog" ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {row.origin === "modified" ? "edited" : "custom"}
                      </span>
                    ) : null}
                  </div>
                  {rule.description ? (
                    <p className="max-w-md truncate text-xs text-muted-foreground">
                      {rule.description}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell>
                  <SeverityBadge severity={rule.severity ?? "low"} />
                </TableCell>
                <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                  {conditionSummary(rule)}
                </TableCell>
                {/* Locale-independent: toLocaleDateString() renders in the
                      server's locale during SSR and the browser's on hydration,
                      which React reports as a hydration mismatch. */}
                <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                  {/* Null while a catalog rule is untouched: it ships with the
                      code and has never been written to the database. */}
                  {row.updatedAt ? row.updatedAt.slice(0, 10) : "shipped"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Switch
                      checked={row.enabled}
                      onCheckedChange={(v) => toggleRule(row, v)}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Actions for ${row.ruleId}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() =>
                            setMode({
                              kind: "edit",
                              docId: row.id,
                              rule: row.body as Rule,
                            })
                          }
                        >
                          <Pencil className="size-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            setMode({
                              kind: "duplicate",
                              rule: row.body as Rule,
                            })
                          }
                        >
                          <Copy className="size-4" />
                          Duplicate
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </TableShell>

      <Pager
        page={paging.page}
        perPage={paging.perPage}
        total={paging.total}
        hasMore={paging.hasMore}
        basePath="/dashboard/rules"
      />

      {/* Keyed so switching between rules remounts the form with fresh state
          instead of keeping the previous rule's values. */}
      <Dialog
        open={mode !== null}
        onOpenChange={(open) => !open && setMode(null)}
      >
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
              key={
                mode.kind === "create"
                  ? "create"
                  : `${mode.kind}:${mode.rule.id}`
              }
              mode={mode}
              scopeOptions={scopeOptions}
              onSaved={onSaved}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function conditionSummary(rule: Record<string, unknown>): string {
  const parts: string[] = [];
  if (rule.when) parts.push("payload");
  if (rule.paths) parts.push(`paths (${(rule.paths as string[]).length})`);
  if (rule.added_lines) parts.push("diff regex");
  if (rule.ai) parts.push("ai review");
  return parts.join(" · ") || "none";
}
