import { Bar } from "@/components/page-skeleton";

// `count` is null while loading.
export function TableToolbar({
  count,
  noun,
  plural,
  actions,
  primary,
  children,
}: {
  count: number | null;
  noun: string;
  plural?: string;
  actions?: React.ReactNode;
  primary?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-7 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {count === null ? (
        <Bar width="w-20" />
      ) : (
        <span className="text-sm text-muted-foreground tabular-nums">
          {count.toLocaleString("en")} {count === 1 ? noun : (plural ?? `${noun}s`)}
        </span>
      )}

      {(actions || children || primary) && (
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {children}
          {primary}
        </div>
      )}
    </div>
  );
}
