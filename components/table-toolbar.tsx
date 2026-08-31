// The row above every table: how many rows on the left, the controls on the.
export function TableToolbar({
  count,
  noun,
  plural,
  actions,
  primary,
  children,
}: {
  count: number;
  noun: string;
  plural?: string;
  actions?: React.ReactNode;
  primary?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-muted-foreground">
        {count} {count === 1 ? noun : (plural ?? `${noun}s`)}
      </span>

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
