"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NumberField } from "@/components/number-field";
import { api, ApiClientError } from "@/lib/api-client";
import { AI_LIMITS } from "@/lib/ai-budget";
import { formatNumber } from "@/lib/format";

export type AiBudget = {
  dailyTokenBudget: number;
  pushTokenBudget: number;
  stored: { daily: number | null; push: number | null };
  usage: { reviews: number; inputTokens: number; outputTokens: number };
};

export function BudgetDialog({ initial }: { initial: AiBudget }) {
  const [open, setOpen] = useState(false);
  const [budget, setBudget] = useState(initial);
  const [daily, setDaily] = useState(initial.stored.daily ?? undefined);
  const [push, setPush] = useState(initial.stored.push ?? undefined);
  const [saving, setSaving] = useState(false);

  const used = budget.usage.inputTokens + budget.usage.outputTokens;

  async function save() {
    setSaving(true);
    try {
      const next = await api<Omit<AiBudget, "stored">>("/api/ai/budget", {
        method: "PATCH",
        body: { dailyTokenBudget: daily ?? null, pushTokenBudget: push ?? null },
      });
      setBudget({ ...next, stored: { daily: daily ?? null, push: push ?? null } });
      toast.success("Budgets saved");
      setOpen(false);
    } catch (cause) {
      toast.error(cause instanceof ApiClientError ? cause.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Gauge className="size-4" />
          Budget
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] max-w-lg">
        <DialogHeader>
          <DialogTitle>Token budget</DialogTitle>
        </DialogHeader>
        <dl className="divide-y rounded-lg border text-sm">
          {[
            ["Used today", `${formatNumber(used)} of ${formatNumber(budget.dailyTokenBudget)}`],
            ["Input / output", `${formatNumber(budget.usage.inputTokens)} / ${formatNumber(budget.usage.outputTokens)}`],
            ["Reviews today", formatNumber(budget.usage.reviews)],
          ].map(([term, value]) => (
            <div key={term} className="flex items-center justify-between gap-4 px-3 py-2">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField
            id="daily-budget"
            label="Daily token budget"
            value={daily}
            placeholder={AI_LIMITS.dailyTokenBudget.default}
            min={10_000}
            max={AI_LIMITS.dailyTokenBudget.ceiling}
            onChange={setDaily}
          />
          <NumberField
            id="push-budget"
            label="Per-push token budget"
            value={push}
            placeholder={AI_LIMITS.pushTokenBudget.default}
            min={5_000}
            max={AI_LIMITS.pushTokenBudget.ceiling}
            onChange={setPush}
          />
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
