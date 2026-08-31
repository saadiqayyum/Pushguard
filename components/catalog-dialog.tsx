"use client";

import { useState } from "react";
import { Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { SeverityBadge } from "@/components/severity-badge";
import type { Severity } from "@/schemas/rule";

export type CatalogPack = { id: string; title: string; blurb: string };

// The least a browsable rule has to be. Pattern rules and AI rules are.
export type CatalogItem = {
  id: string;
  description?: string;
  severity: Severity;
  enabled: boolean;
  pack?: string;
  kind?: "pattern" | "ai";
};

// The catalog, as a searchable picker rather than rows in the table.
export function CatalogDialog<T extends CatalogItem>({
  rules,
  packs,
  label,
  onSelect,
}: {
  rules: T[];
  packs: CatalogPack[];
  label?: string;
  onSelect: (rule: T) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Library className="size-4" />
        {label ?? "Browse catalog"} ({rules.length})
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Rule catalog"
        description="Every rule Pushguard ships, and AI rule examples. Pick one to start your own from it."
        showCloseButton
        className="top-1/2 flex max-h-[80dvh] -translate-y-1/2 flex-col overflow-hidden sm:max-w-3xl"
      >
        <Command className="h-auto min-h-0 flex-1">
          <CommandInput placeholder="Search rules, packs, or what they detect..." />
          <CommandList className="max-h-none min-h-0 flex-1">
            <CommandEmpty>No rule matches that.</CommandEmpty>
            {packs.map((pack) => {
              const inPack = rules.filter((rule) => rule.pack === pack.id);
              if (inPack.length === 0) return null;
              return (
                <CommandGroup
                  key={pack.id}
                  heading={`${pack.title} — ${pack.blurb}`}
                >
                  {inPack.map((rule) => (
                    <CommandItem
                      key={rule.id}
                      value={`${rule.id} ${pack.id} ${rule.description ?? ""}`}
                      onSelect={() => {
                        setOpen(false);
                        onSelect(rule);
                      }}
                      className="items-center gap-3 py-2"
                    >
                      <span className="w-16 shrink-0">
                        <SeverityBadge severity={rule.severity} />
                      </span>
                      <span className="w-64 shrink-0 truncate font-medium">
                        {rule.id}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {rule.description}
                      </span>
                      {rule.kind === "ai" && (
                        <span className="shrink-0 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background">
                          AI
                        </span>
                      )}
                      {rule.kind !== "ai" && !rule.enabled && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          off
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
