"use client";

import { useState } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, CircleSlash, Inbox, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { SeverityBadge } from "@/components/severity-badge";
import { TableShell } from "@/components/table-shell";
import { TableToolbar } from "@/components/table-toolbar";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { alertHeadline } from "@/lib/alert-display";
import { formatTimestamp } from "@/lib/format";
import { api, ApiClientError } from "@/lib/api-client";

export type AlertRow = {
  id: string;
  repo: string;
  number: number;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  state: "open" | "closed";
  assignees: string[];
  acknowledgedBy: string | null;
  archived: boolean;
  occurrences: number;
  branch: string | null;
  createdAt: string;
};

type Action = "archive" | "unarchive" | "close";

// The alert feed, with bulk triage.
export function AlertsView({
  alerts,
  archived,
  orgSwitcher,
}: {
  alerts: AlertRow[];
  archived: boolean;
  orgSwitcher?: React.ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Action | null>(null);
  const router = useRouter();

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const allSelected = alerts.length > 0 && selected.size === alerts.length;

  async function run(action: Action) {
    setBusy(action);
    try {
      const result = await api<{
        done: number;
        failed: { id: string; reason: string }[];
      }>("/api/alerts/bulk", {
        method: "POST",
        body: { ids: [...selected], action },
      });
      if (result.done > 0) {
        toast.success(
          action === "close"
            ? `Closed ${result.done} on GitHub`
            : `${action === "archive" ? "Archived" : "Restored"} ${result.done}`,
        );
      }
      for (const failure of result.failed.slice(0, 3)) {
        toast.error(`${failure.id}: ${failure.reason}`);
      }
      setSelected(new Set());
      router.refresh();
    } catch (cause) {
      toast.error(
        cause instanceof ApiClientError
          ? cause.message
          : "Could not update those alerts",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <TableToolbar
        count={selected.size > 0 ? selected.size : alerts.length}
        noun={selected.size > 0 ? "selected" : "alert"}
        plural={selected.size > 0 ? "selected" : undefined}
        actions={
          selected.size > 0 && (
            <>
              <BulkButton
                onClick={() => run(archived ? "unarchive" : "archive")}
                busy={busy === (archived ? "unarchive" : "archive")}
                disabled={busy !== null}
                icon={
                  archived ? (
                    <ArchiveRestore className="size-3.5" />
                  ) : (
                    <Archive className="size-3.5" />
                  )
                }
              >
                {archived ? "Restore" : "Archive"}
              </BulkButton>
              {!archived && (
                <BulkButton
                  onClick={() => run("close")}
                  busy={busy === "close"}
                  disabled={busy !== null}
                  icon={<CircleSlash className="size-3.5" />}
                >
                  Close on GitHub
                </BulkButton>
              )}
            </>
          )
        }
      >
        {orgSwitcher}
        <Button variant="ghost" size="sm" asChild>
          <Link href={archived ? "/dashboard" : "/dashboard?archived=1"}>
            {archived ? <Inbox className="size-4" /> : <Archive className="size-4" />}
            {archived ? "Open alerts" : "Archived"}
          </Link>
        </Button>
      </TableToolbar>

      <TableShell minWidth="md:min-w-[900px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected}
                onCheckedChange={() =>
                  setSelected(
                    allSelected ? new Set() : new Set(alerts.map((a) => a.id)),
                  )
                }
                disabled={alerts.length === 0}
                aria-label="Select all"
              />
            </TableHead>
            <TableHead>Alert</TableHead>
            <TableHead className="hidden md:table-cell">Repository</TableHead>
            <TableHead className="hidden lg:table-cell">Branch</TableHead>
            <TableHead className="hidden lg:table-cell">Triage</TableHead>
            <TableHead className="hidden md:table-cell">When</TableHead>
            <TableHead className="text-right">State</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {alerts.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={7}
                className="text-center text-sm text-muted-foreground"
              >
                {archived ? "Nothing archived." : "No alerts. Quiet is good."}
              </TableCell>
            </TableRow>
          )}
          {alerts.map((alert) => (
            <TableRow key={alert.id}>
              <TableCell>
                <Checkbox
                  checked={selected.has(alert.id)}
                  onCheckedChange={() => toggle(alert.id)}
                  aria-label={`Select ${alert.repo}#${alert.number}`}
                />
              </TableCell>
              <TableCell>
                <Link
                  href={`/dashboard/alerts/${alert.repo}/${alert.number}`}
                  className="block"
                >
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <SeverityBadge severity={alert.severity} />
                    <span className="font-medium">
                      {alertHeadline(alert.title, alert.repo)}
                    </span>
                    {alert.occurrences > 1 && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] text-muted-foreground">
                        {alert.occurrences}×
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block font-mono text-xs break-all text-muted-foreground md:hidden">
                    {alert.repo}#{alert.number}
                    {alert.branch ? ` · ${alert.branch}` : ""}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground md:hidden">
                    {formatTimestamp(alert.createdAt)}
                  </span>
                </Link>
              </TableCell>
              <TableCell className="hidden font-mono text-xs whitespace-nowrap text-muted-foreground md:table-cell">
                {alert.repo}#{alert.number}
              </TableCell>
              <TableCell className="hidden font-mono text-xs whitespace-nowrap text-muted-foreground lg:table-cell">
                {alert.branch ?? "—"}
              </TableCell>
              <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                {alert.assignees.length > 0
                  ? alert.assignees.join(", ")
                  : alert.acknowledgedBy
                    ? `seen by ${alert.acknowledgedBy}, unassigned`
                    : alert.state === "open"
                      ? "nobody has opened this"
                      : "—"}
              </TableCell>
              <TableCell className="hidden text-xs whitespace-nowrap text-muted-foreground md:table-cell">
                {formatTimestamp(alert.createdAt)}
              </TableCell>
              <TableCell className="text-right">
                <Badge variant={alert.state === "open" ? "default" : "outline"}>
                  {alert.state}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </TableShell>
    </div>
  );
}

function BulkButton({
  onClick,
  busy,
  disabled,
  icon,
  children,
}: {
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={disabled}>
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {children}
    </Button>
  );
}
