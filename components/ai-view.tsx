"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { PageHeader } from "@/components/page-header";
import { TableShell } from "@/components/table-shell";
import { TableToolbar } from "@/components/table-toolbar";
import { api, ApiClientError } from "@/lib/api-client";

export type AiProvider = "anthropic" | "openai" | "google-genai";

export type AiKey = {
  id: string;
  label: string;
  provider: AiProvider;
  keyHint: string;
  model: string;
  effort: "low" | "medium" | "high";
  baseUrl?: string;
};

export type AiSettings = {
  keys: AiKey[];
  defaultKey: string | null;
  encryptionReady: boolean;
};

const PROVIDERS: { value: AiProvider; label: string; model: string }[] = [
  { value: "anthropic", label: "Anthropic", model: "claude-haiku-4-5" },
  { value: "openai", label: "OpenAI", model: "gpt-4o-mini" },
  { value: "google-genai", label: "Google Gemini", model: "gemini-3.6-flash" },
];

const providerLabel = (value: AiProvider) =>
  PROVIDERS.find((entry) => entry.value === value)?.label ?? value;

type Draft = {
  label: string;
  provider: AiProvider;
  apiKey: string;
  model: string;
  effort: "low" | "medium" | "high";
  baseUrl: string;
};

const BLANK: Draft = {
  label: "",
  provider: "anthropic",
  apiKey: "",
  model: "claude-haiku-4-5",
  effort: "medium",
  baseUrl: "",
};

type Mode = { kind: "create" } | { kind: "edit"; key: AiKey };

export function AiView({ initial }: { initial: AiSettings }) {
  const [keys, setKeys] = useState(initial.keys);
  const [defaultKey, setDefaultKey] = useState(initial.defaultKey);
  const [mode, setMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function makeDefault(id: string) {
    const previous = defaultKey;
    setDefaultKey(id);
    try {
      await api("/api/ai", { method: "PATCH", body: { defaultKey: id } });
      toast.success("Default key updated");
      router.refresh();
    } catch (cause) {
      setDefaultKey(previous);
      toast.error(
        cause instanceof ApiClientError ? cause.message : "Update failed",
      );
    }
  }

  async function remove(key: AiKey) {
    setBusy(true);
    try {
      await api(`/api/ai?id=${key.id}`, { method: "DELETE" });
      const left = keys.filter((entry) => entry.id !== key.id);
      setKeys(left);
      if (defaultKey === key.id) setDefaultKey(left[0]?.id ?? null);
      toast.success(`Removed ${key.label}`);
      router.refresh();
    } catch (cause) {
      toast.error(
        cause instanceof ApiClientError ? cause.message : "Could not remove",
      );
    } finally {
      setBusy(false);
    }
  }

  function saved(key: AiKey, was: Mode) {
    setKeys((current) =>
      was.kind === "edit"
        ? current.map((entry) => (entry.id === key.id ? key : entry))
        : [...current, key],
    );
    if (was.kind === "create" && keys.length === 0) setDefaultKey(key.id);
    setMode(null);
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 sm:px-6 lg:px-8">
      <PageHeader
        title="AI"
        description="Keys for rules that ask for model review. A rule turns it on, not this page."
      />

      <TableToolbar
        count={keys.length}
        noun="key"
        primary={
          <Button
            size="sm"
            disabled={!initial.encryptionReady}
            onClick={() => setMode({ kind: "create" })}
          >
            <Plus className="size-4" />
            New key
          </Button>
        }
      />

      {!initial.encryptionReady && (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            This deployment cannot store keys yet.
          </CardContent>
        </Card>
      )}

      <TableShell>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="hidden sm:table-cell">Provider</TableHead>
            <TableHead>Model</TableHead>
            <TableHead className="hidden md:table-cell">Key</TableHead>
            <TableHead className="text-right">Default</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={6}
                className="text-center text-sm text-muted-foreground"
              >
                No keys yet. Add one to let rules ask for model review.
              </TableCell>
            </TableRow>
          )}
          {keys.map((key) => (
            <TableRow key={key.id}>
              <TableCell className="font-medium">{key.label}</TableCell>
              <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                {providerLabel(key.provider)}
              </TableCell>
              <TableCell className="font-mono text-xs">{key.model}</TableCell>
              <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                {key.keyHint}
              </TableCell>
              <TableCell className="text-right">
                {defaultKey === key.id && (
                  <Check className="ml-auto size-4 text-muted-foreground" />
                )}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Actions for ${key.label}`}
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      disabled={defaultKey === key.id}
                      onSelect={() => makeDefault(key.id)}
                    >
                      <Star className="size-4" />
                      Make default
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => setMode({ kind: "edit", key })}
                    >
                      <Pencil className="size-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={busy}
                      onSelect={() => remove(key)}
                    >
                      <Trash2 className="size-4" />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </TableShell>

      <Dialog
        open={mode !== null}
        onOpenChange={(open) => !open && setMode(null)}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-2xl gap-6 p-6 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {mode?.kind === "edit" ? `Edit ${mode.key.label}` : "New key"}
            </DialogTitle>
          </DialogHeader>
          {mode && (
            <KeyForm
              key={mode.kind === "edit" ? mode.key.id : "create"}
              mode={mode}
              onSaved={(entry) => saved(entry, mode)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KeyForm({
  mode,
  onSaved,
}: {
  mode: Mode;
  onSaved: (key: AiKey) => void;
}) {
  const [form, setForm] = useState<Draft>(() =>
    mode.kind === "edit" ? { ...mode.key, apiKey: "", baseUrl: mode.key.baseUrl ?? "" } : BLANK,
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

        {form.provider === "anthropic" && (
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
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="base-url">Base URL</Label>
        <Input
          id="base-url"
          type="url"
          spellCheck={false}
          className="font-mono"
          placeholder="Leave blank for the provider's own endpoint"
          value={form.baseUrl}
          onChange={(event) => set("baseUrl")(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          For a compatible gateway such as z.ai. Must be https. Triage then runs on this model too.
        </p>
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
