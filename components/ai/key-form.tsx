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
import { api, ApiClientError } from "@/lib/api-client";
import { ModelLimitsFields, type ModelLimits } from "@/components/model-limits-fields";

export type AiProvider = "anthropic" | "openai" | "google-genai";

export type AiKey = {
  id: string;
  label: string;
  provider: AiProvider;
  keyHint: string;
  model: string;
  effort: "low" | "medium" | "high";
  baseUrl?: string;
  maxOutputTokens?: number | null;
  thinkingBudget?: number | null;
  timeoutMs?: number | null;
};

const PROVIDERS: { value: AiProvider; label: string; model: string }[] = [
  { value: "anthropic", label: "Anthropic", model: "claude-haiku-4-5" },
  { value: "openai", label: "OpenAI", model: "gpt-4o-mini" },
  { value: "google-genai", label: "Google Gemini", model: "gemini-3.6-flash" },
];

export const providerLabel = (value: AiProvider) =>
  PROVIDERS.find((entry) => entry.value === value)?.label ?? value;

type Draft = {
  label: string;
  provider: AiProvider;
  apiKey: string;
  model: string;
  effort: "low" | "medium" | "high";
  baseUrl: string;
} & ModelLimits;

const BLANK: Draft = {
  label: "",
  provider: "anthropic",
  apiKey: "",
  model: "claude-haiku-4-5",
  effort: "medium",
  baseUrl: "",
};

export type KeyFormMode = { kind: "create" } | { kind: "edit"; key: AiKey };

export function KeyForm({
  mode,
  onSaved,
}: {
  mode: KeyFormMode;
  onSaved: (key: AiKey) => void;
}) {
  const [form, setForm] = useState<Draft>(() =>
    mode.kind === "edit"
      ? { ...mode.key, apiKey: "", baseUrl: mode.key.baseUrl ?? "" }
      : BLANK,
  );
  const [saving, setSaving] = useState(false);

  const set =
    <K extends keyof Draft>(field: K) =>
    (value: Draft[K]) =>
      setForm((current) => ({ ...current, [field]: value }));

  const ready =
    form.label.trim() !== "" &&
    form.model.trim() !== "" &&
    (mode.kind === "edit" || form.apiKey.trim() !== "");

  async function submit() {
    setSaving(true);
    try {
      const body = {
        label: form.label.trim(),
        provider: form.provider,
        model: form.model.trim(),
        effort: form.effort,
        maxOutputTokens: form.maxOutputTokens ?? null,
        thinkingBudget: form.thinkingBudget ?? null,
        timeoutMs: form.timeoutMs ?? null,
        ...(form.baseUrl.trim() ? { baseUrl: form.baseUrl.trim() } : {}),
        ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
      };
      const saved =
        mode.kind === "edit"
          ? await api<AiKey>(`/api/ai/${mode.key.id}`, {
              method: "PATCH",
              body,
            })
          : await api<AiKey>("/api/ai", { method: "POST", body });
      toast.success(mode.kind === "edit" ? "Saved" : "Key added");
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
          <Label htmlFor="label">Name</Label>
          <Input
            id="label"
            value={form.label}
            placeholder="Production"
            onChange={(event) => set("label")(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Provider</Label>
          <Select
            value={form.provider}
            onValueChange={(value) => {
              const next = PROVIDERS.find((entry) => entry.value === value)!;
              setForm((current) => ({
                ...current,
                provider: next.value,
                model: next.model,
              }));
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((entry) => (
                <SelectItem key={entry.value} value={entry.value}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="model">Model</Label>
          <Input
            id="model"
            value={form.model}
            className="font-mono"
            onChange={(event) => set("model")(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Effort</Label>
          <Select
            value={form.effort}
            onValueChange={(value) => set("effort")(value as Draft["effort"])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <ModelLimitsFields
        prefix="key"
        value={form}
        onChange={(next) => setForm((current) => ({ ...current, ...next }))}
      />

      <div className="space-y-1.5">
        <Label htmlFor="base-url">Base URL</Label>
        <Input
          id="base-url"
          type="url"
          spellCheck={false}
          className="font-mono"
          placeholder="(Optional)"
          value={form.baseUrl}
          onChange={(event) => set("baseUrl")(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="api-key">API key</Label>
        <Input
          id="api-key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          placeholder={mode.kind === "edit" ? mode.key.keyHint : undefined}
          value={form.apiKey}
          onChange={(event) => set("apiKey")(event.target.value)}
        />
      </div>

      <div className="flex justify-end pt-1">
        <Button onClick={submit} disabled={saving || !ready}>
          {mode.kind === "edit" ? "Save" : "Add key"}
        </Button>
      </div>
    </div>
  );
}
