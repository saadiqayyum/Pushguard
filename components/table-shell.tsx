import { Table } from "@/components/ui/table";

// The bordered table every list uses. Columns hide by breakpoint instead of forcing a minimum width.
export function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>{children}</Table>
    </div>
  );
}
