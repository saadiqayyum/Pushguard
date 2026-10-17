"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, MoreHorizontal, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { KeyForm, providerLabel, type AiKey, type KeyFormMode } from "@/components/ai/key-form";
import { PageHeader } from "@/components/page-header";
import { TableShell } from "@/components/table-shell";
import { TableColumns, AI_KEY_COLUMNS } from "@/components/table-columns";
import { TableToolbar } from "@/components/table-toolbar";
import { api, ApiClientError } from "@/lib/api-client";

export type AiSettings = {
  keys: AiKey[];
  defaultKey: string | null;
  encryptionReady: boolean;
};

// `actions` are the page's other header buttons, placed before "New key".
export function AiView({ initial, actions }: { initial: AiSettings; actions?: React.ReactNode }) {
  const [keys, setKeys] = useState(initial.keys);
  const [defaultKey, setDefaultKey] = useState(initial.defaultKey);
  const [mode, setMode] = useState<KeyFormMode | null>(null);
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
      toast.error(cause instanceof ApiClientError ? cause.message : "Update failed");
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
      toast.error(cause instanceof ApiClientError ? cause.message : "Could not remove");
    } finally {
      setBusy(false);
    }
  }

  function saved(key: AiKey, was: KeyFormMode) {
    setKeys((current) =>
      was.kind === "edit" ? current.map((entry) => (entry.id === key.id ? key : entry)) : [...current, key],
    );
    if (was.kind === "create" && keys.length === 0) setDefaultKey(key.id);
    setMode(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI"
        actions={
          <>
            {actions}
            <Button size="sm" disabled={!initial.encryptionReady} onClick={() => setMode({ kind: "create" })}>
              <Plus className="size-4" />
              New key
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        <TableToolbar count={keys.length} noun="key">
          {!initial.encryptionReady && (
            <span className="text-sm text-destructive">Key storage not configured (ENCRYPTION_KEY)</span>
          )}
        </TableToolbar>

        <TableShell>
          <TableColumns columns={AI_KEY_COLUMNS} />
          <TableBody>
            {keys.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  No keys
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
                  {defaultKey === key.id && <Check className="ml-auto size-4 text-muted-foreground" aria-label="Default" />}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" aria-label={`Actions for ${key.label}`}>
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem disabled={defaultKey === key.id} onSelect={() => makeDefault(key.id)}>
                        <Star className="size-4" />
                        Make default
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setMode({ kind: "edit", key })}>
                        <Pencil className="size-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" disabled={busy} onSelect={() => remove(key)}>
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
      </div>

      <Dialog open={mode !== null} onOpenChange={(open) => !open && setMode(null)}>
        <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl gap-6 overflow-y-auto p-6 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{mode?.kind === "edit" ? `Edit ${mode.key.label}` : "New key"}</DialogTitle>
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
