/**
 * The row above every table: how many rows on the left, the controls on the
 * right. Page-level actions ("New rule", "New scan") live here too rather than
 * beside the heading, so every list has the same one place to look.
 *
 * Below `sm` it stacks: the count on its own line, the controls wrapping under
 * it. Kept as one row it pushed the last control off the screen.
 */
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
  /** Defaults to `noun` + s. Pass it when that is wrong ("14 selected"). */
  plural?: string;
  /** Act on the selection. */
  actions?: React.ReactNode;
  /** The page's main action. Sits last, where the eye ends. */
  primary?: React.ReactNode;
  /** Change what is listed: filters, switchers, settings. */
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
