import { Table } from "@/components/ui/table";

// The bordered table every list uses.
export function TableShell({
  children,
  minWidth = "md:min-w-[640px]",
}: {
  children: React.ReactNode;
  minWidth?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table className={minWidth}>{children}</Table>
    </div>
  );
}
