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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { AiRuleForm, type AiRuleFormMode } from "@/components/ai-rule-form";
import { AI_EXAMPLE_PACKS, aiExamples } from "@/lib/rules/ai-examples";
import type { AiRule } from "@/schemas/ai-rule";
import { PageHeader } from "@/components/page-header";
import { TableToolbar } from "@/components/table-toolbar";
import { SeverityBadge } from "@/components/severity-badge";
import { TableShell } from "@/components/table-shell";

export function RulesView({
  initialRules,
  catalog,
  catalogPacks,
  aiKeys,
  loadError,
  paging,
  scopeOptions,
}: {
  initialRules: RuleRow[];
  catalog: Rule[];
  catalogPacks: CatalogPack[];
  aiKeys: { id: string; label: string; model: string }[];
  loadError: boolean;
  paging: { page: number; perPage: number; total: number; hasMore: boolean };
  scopeOptions: ScopeOption[];
}) {
  const [rows, setRows] = useState(initialRules);
  const [mode, setMode] = useState<RuleFormMode | null>(null);
  const [aiMode, setAiMode] = useState<AiRuleFormMode | null>(null);
  const [only, setOnly] = useState<"all" | "pattern" | "ai">("all");

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
      if (row.kind === "ai") {
        await api(`/api/ai-rules/${row.ruleId}`, {
          method: "PATCH",
          body: { ...row.body, enabled },
        });
      } else {
        await api(`/api/rules/${row.id}`, {
          method: "PATCH",
          body: { enabled },
        });
      }
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <Plus className="size-4" />
                New rule
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setMode({ kind: "create" })}>
                Pattern rule
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAiMode({ kind: "create" })}>
                AI rule
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        <Select value={only} onValueChange={(v) => setOnly(v as typeof only)}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All rules</SelectItem>
            <SelectItem value="pattern">Pattern only</SelectItem>
            <SelectItem value="ai">AI only</SelectItem>
          </SelectContent>
        </Select>
        <ImportRulesDialog />
        <CatalogDialog
          rules={[
            ...catalog.map((rule) => ({ ...rule, kind: "pattern" as const })),
            ...aiExamples.map((rule) => ({
              ...rule,
              pack: "ai-examples",
              kind: "ai" as const,
            })),
          ]}
          packs={[...catalogPacks, ...AI_EXAMPLE_PACKS]}
          onSelect={({ kind, pack, ...rule }) =>
            // `kind` and `pack` are added here for browsing and are not part of
            // either schema. Both are strict, so carrying them through is a
            // rejected save.
            kind === "ai"
              ? setAiMode({
                  kind: "create",
                  from: {
                    ...(rule as unknown as AiRule),
                    id: rule.id.replace(/^example-/, ""),
                  },
                })
              : setMode({
                  kind: "duplicate",
                  rule: { ...rule, ...(pack ? { pack } : {}) } as unknown as Rule,
                })
          }
        />
      </TableToolbar>

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
          {rows
            .filter((row) => only === "all" || row.kind === only)
            .map((row) => {
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
                      {row.kind === "ai" && (
                        <span className="rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background">
                          AI
                        </span>
                      )}
                      {row.kind === "pattern" && row.origin !== "catalog" ? (
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
                  <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
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
                              row.kind === "ai"
                                ? setAiMode({
                                    kind: "edit",
                                    rule: row.body as AiRule,
                                  })
                                : setMode({
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
                              row.kind === "ai"
                                ? setAiMode({
                                    kind: "edit",
                                    rule: row.body as AiRule,
                                  })
                                : setMode({
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

      <Dialog
        open={aiMode !== null}
        onOpenChange={(open) => !open && setAiMode(null)}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-2xl gap-6 p-6 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {aiMode?.kind === "edit"
                ? `Edit ${aiMode.rule.id}`
                : "New AI rule"}
            </DialogTitle>
          </DialogHeader>
          {aiMode && (
            <AiRuleForm
              key={
                aiMode.kind === "edit"
                  ? aiMode.rule.id
                  : (aiMode.from?.id ?? "create")
              }
              mode={aiMode}
              keys={aiKeys}
              onSaved={() => {
                setAiMode(null);
                window.location.reload();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={mode !== null}
        onOpenChange={(open) => !open && setMode(null)}
      >
        <DialogContent
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
  const on = rule.on as string[] | undefined;
  if (on?.length === 1) parts.push(on[0] === "push" ? "pushes only" : "pull requests only");
  if (rule.paths) parts.push(`paths (${(rule.paths as string[]).length})`);
  if (rule.added_lines) parts.push("diff regex");
  if (rule.ai) parts.push("ai review");
  return parts.join(" · ") || "none";
}
