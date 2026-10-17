"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiClientError } from "@/lib/api-client";

export type McpToken = { id: string; label: string; hint: string; createdAt: string; lastUsedAt: string | null };

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB") : "Never");

function CopyField({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} className="font-mono text-xs" aria-label={label} />
      <Button
        size="icon"
        variant="outline"
        aria-label={`Copy ${label.toLowerCase()}`}
        onClick={() => navigator.clipboard.writeText(value).then(() => toast.success("Copied"))}
      >
        <Copy className="size-4" />
      </Button>
    </div>
  );
}

export function McpTokensDialog({ initial, endpoint }: { initial: McpToken[]; endpoint: string }) {
  const [tokens, setTokens] = useState(initial);
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { token, ...row } = await api<McpToken & { token: string }>("/api/ai/mcp-tokens", {
        method: "POST",
        body: { label: label.trim() },
      });
      setTokens((current) => [...current, row]);
      setCreated(token);
      setLabel("");
    } catch (cause) {
      toast.error(cause instanceof ApiClientError ? cause.message : "Could not create");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: McpToken) {
    setBusy(true);
    try {
      await api(`/api/ai/mcp-tokens?id=${token.id}`, { method: "DELETE" });
      setTokens((current) => current.filter((t) => t.id !== token.id));
      toast.success(`Revoked ${token.label}`);
    } catch (cause) {
      toast.error(cause instanceof ApiClientError ? cause.message : "Could not revoke");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog onOpenChange={(open) => !open && setCreated(null)}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <KeyRound className="size-4" />
          MCP tokens
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById("mcp-label")?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>MCP tokens</DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Endpoint</Label>
          <CopyField value={`${endpoint}?repo=owner/name`} label="Endpoint" />
        </div>

        {created && (
          <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3">
            <Label>New token, shown once</Label>
            <CopyField value={created} label="Token" />
          </div>
        )}

        {tokens.length === 0 ? (
          <p className="rounded-lg border px-3 py-4 text-center text-sm text-muted-foreground">No tokens</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm">
            {tokens.map((token) => (
              <li key={token.id} className="flex items-center gap-3 py-1.5 pr-1.5 pl-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{token.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    <span className="font-mono">…{token.hint}</span>, last used {day(token.lastUsedAt)}
                  </span>
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={busy}
                  aria-label={`Revoke ${token.label}`}
                  onClick={() => revoke(token)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={create} className="flex items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="mcp-label">New token name</Label>
            <Input id="mcp-label" value={label} placeholder="Laptop" maxLength={60} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy || label.trim() === ""}>
            <Plus className="size-4" />
            Create
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
