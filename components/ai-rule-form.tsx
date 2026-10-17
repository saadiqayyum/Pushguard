"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ModelLimitsFields } from "@/components/model-limits-fields";
import { api, ApiClientError } from "@/lib/api-client";
import { aiRuleSchema, type AiRule } from "@/schemas/ai-rule";
import { AI_LIMITS } from "@/lib/ai-budget";
import type { Severity } from "@/schemas/rule";

// `from` prefills the form without implying the rule exists yet.
export type AiRuleFormMode =
  { kind: "create"; from?: AiRule } | { kind: "edit"; rule: AiRule };

// The catalog browser tags rows with `kind` and `pack` so it can group them,
// and `aiRuleSchema` is strict: carrying either into the save is a rejection.
function onlyKnownFields(rule: AiRule): AiRule {
  const known = new Set(Object.keys(aiRuleSchema.shape));
  return Object.fromEntries(
    Object.entries(rule).filter(([field]) => known.has(field)),
  ) as AiRule;
}

// Gates worth offering. Each one narrows when the question is asked, which is
// the only cost control an AI rule has besides its paths.
const PUSH_CONDITIONS = [
  { field: "forced", label: "Force push" },
  { field: "sender_first_push", label: "First push from this account" },
  { field: "branch_created", label: "Branch created" },
  { field: "author_mismatch", label: "Author is not the pusher" },
  { field: "unreviewed", label: "No pull request" },
] as const satisfies readonly { field: keyof NonNullable<AiRule["when"]>; label: string }[];

const SOURCES = [
  { value: "push", label: "Pushes" },
  { value: "pull_request", label: "Pull requests" },
] as const;
const ALL_SOURCES: NonNullable<AiRule["on"]> = SOURCES.map((source) => source.value);

export const BLANK_AI_RULE: AiRule = {
  id: "",
  severity: "high",
  enabled: true,
  prompt: "",
  scope: "changed",
  budget: 40,
};

export function AiRuleForm({
  mode,
  keys,
  onSaved,
}: {
  mode: AiRuleFormMode;
  keys: { id: string; label: string; model: string }[];
  onSaved: (rule: AiRule) => void;
}) {
  const [form, setForm] = useState<AiRule>(
    onlyKnownFields(mode.kind === "edit" ? mode.rule : (mode.from ?? BLANK_AI_RULE)),
  );
  const [paths, setPaths] = useState(
    ((mode.kind === "edit" ? mode.rule.paths : mode.from?.paths) ?? []).join(
      ", ",
    ),
  );
  const [saving, setSaving] = useState(false);

  const ready =
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(form.id) && form.prompt.trim().length >= 10;

  async function submit() {
    setSaving(true);
    try {
      const list = paths
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const body: AiRule = {
        ...form,
        prompt: form.prompt.trim(),
        ...(list.length > 0 ? { paths: list } : { paths: undefined }),
      };
      const saved =
        mode.kind === "edit"
          ? await api<AiRule>(`/api/ai-rules/${mode.rule.id}`, {
              method: "PATCH",
              body,
            })
          : await api<AiRule>("/api/ai-rules", { method: "POST", body });
      toast.success(mode.kind === "edit" ? "Saved" : "Rule created");
      onSaved(saved);
    } catch (cause) {
      toast.error(
        cause instanceof ApiClientError ? cause.message : "Could not save",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="rule-id">Id</Label>
          <Input
            id="rule-id"
            value={form.id}
            disabled={mode.kind === "edit"}
            placeholder="hidden-exfiltration"
            className="font-mono"
            onChange={(event) => setForm({ ...form, id: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Severity</Label>
          <Select
            value={form.severity}
            onValueChange={(value) =>
              setForm({ ...form, severity: value as Severity })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["low", "medium", "high", "critical"].map((level) => (
                <SelectItem key={level} value={level}>
                  {level}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="prompt">Prompt</Label>
        <Textarea
          id="prompt"
          rows={3}
          value={form.prompt}
          placeholder="Does this code send data anywhere it was not asked to?"
          onChange={(event) => setForm({ ...form, prompt: event.target.value })}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Reads</Label>
          <Select
            value={form.scope}
            onValueChange={(value) =>
              setForm({ ...form, scope: value as AiRule["scope"] })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="changed">Files this push changed</SelectItem>
              <SelectItem value="repository">The whole repository</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.scope === "repository" && (
          <div className="space-y-1.5">
            <Label htmlFor="budget">Tool call budget</Label>
            <Input
              id="budget"
              type="number"
              min={5}
              max={AI_LIMITS.maxToolCalls.ceiling}
              value={form.budget}
              onChange={(event) =>
                setForm({ ...form, budget: Number(event.target.value) || 40 })
              }
            />
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Runs on</Label>
          <div className="flex flex-wrap gap-2">
            {SOURCES.map((source) => {
              const active = (form.on ?? ALL_SOURCES).includes(source.value);
              return (
                <Button
                  key={source.value}
                  type="button"
                  size="sm"
                  variant={active ? "default" : "outline"}
                  onClick={() => {
                    const current = form.on ?? ALL_SOURCES;
                    const next = active
                      ? current.filter((s) => s !== source.value)
                      : [...current, source.value];
                    if (next.length === 0) return;
                    setForm({ ...form, on: next.length === ALL_SOURCES.length ? undefined : next });
                  }}
                >
                  {source.label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Only run when</Label>
        <div className="flex flex-wrap gap-2">
          {PUSH_CONDITIONS.map((condition) => {
            const on = form.when?.[condition.field] === true;
            return (
              <Button
                key={condition.field}
                type="button"
                size="sm"
                variant={on ? "default" : "outline"}
                onClick={() => {
                  const when = { ...(form.when ?? {}) };
                  if (on) delete when[condition.field];
                  else when[condition.field] = true;
                  setForm({
                    ...form,
                    when: Object.keys(when).length > 0 ? when : undefined,
                  });
                }}
              >
                {condition.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Key</Label>
          <Select
            value={form.key ?? "default"}
            onValueChange={(value) =>
              setForm({ ...form, key: value === "default" ? undefined : value })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Account default</SelectItem>
              {keys.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.label} · {entry.model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {keys.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No keys
            </p>
          )}
        </div>
      </div>

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="group -ml-2 gap-1">
            Model settings
            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rule-model">Model</Label>
              <Input
                id="rule-model"
                value={form.model ?? ""}
                className="font-mono"
                placeholder="Key default"
                onChange={(event) => setForm({ ...form, model: event.target.value.trim() || undefined })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Effort</Label>
              <Select
                value={form.effort ?? "default"}
                onValueChange={(value) =>
                  setForm({ ...form, effort: value === "default" ? undefined : (value as AiRule["effort"]) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Key default</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <ModelLimitsFields
            prefix="rule"
            withInput
            value={{
              maxOutputTokens: form.max_output_tokens,
              thinkingBudget: form.thinking_budget,
              timeoutMs: form.timeout_ms,
              maxInputTokens: form.max_input_tokens,
            }}
            onChange={(next) =>
              setForm({
                ...form,
                max_output_tokens: next.maxOutputTokens ?? undefined,
                thinking_budget: next.thinkingBudget ?? undefined,
                timeout_ms: next.timeoutMs ?? undefined,
                max_input_tokens: next.maxInputTokens ?? undefined,
              })
            }
          />
        </CollapsibleContent>
      </Collapsible>

      <div className="space-y-1.5">
        <Label htmlFor="paths">Paths</Label>
        <Input
          id="paths"
          value={paths}
          className="font-mono"
          placeholder="**/*.ts, src/**"
          onChange={(event) => setPaths(event.target.value)}
        />
      </div>

      <div className="flex justify-end pt-1">
        <Button onClick={submit} disabled={saving || !ready}>
          {mode.kind === "edit" ? "Save" : "Create"}
        </Button>
      </div>
    </div>
  );
}
