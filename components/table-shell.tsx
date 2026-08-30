import { Table } from "@/components/ui/table";

/**
 * The bordered table every list uses.
 *
 * The min-width only applies from `md` up. Forcing it at every size was what
 * made the phone layout a 900px sideways scroll: below `md` the lists drop
 * their secondary columns instead, so the table fits the screen it is on.
 *
 * No overflow here. `Table` already renders its own scroll container, and
 * nesting a second one meant a horizontal drag on a phone caught the outer
 * element and moved nothing.
 */
export function TableShell({
  children,
  minWidth = "md:min-w-[640px]",
}: {
  children: React.ReactNode;
  /** Responsive Tailwind class, so phones are never forced to scroll. */
  minWidth?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table className={minWidth}>{children}</Table>
    </div>
  );
}
