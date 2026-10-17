import { TableShell } from "@/components/table-shell"
import { TableColumns, type Column } from "@/components/table-columns"
import { Skeleton } from "@/components/ui/skeleton"
import { TableBody, TableCell, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

const ROWS = 6
const WIDTHS = ["w-3/4", "w-2/3", "w-4/5", "w-1/2", "w-3/5", "w-2/3"]

// A text-line placeholder: the box is one line of text-sm tall, so it occupies exactly what the text will.
export function Bar({ width = "w-24", className }: { width?: string; className?: string }) {
  return (
    <span className={cn("flex h-5 items-center", className)}>
      <Skeleton className={cn("h-3", width)} />
    </span>
  )
}

export function TableSkeleton({
  columns,
  lead,
}: {
  columns: Column[]
  lead?: React.ReactNode
}) {
  return (
    <TableShell>
      <TableColumns columns={columns} lead={lead} />
      <TableBody>
        {Array.from({ length: ROWS }, (_, row) => (
          <TableRow key={row} className="hover:bg-transparent">
            {lead && <TableCell />}
            {columns.map((column, i) => (
              <TableCell key={i} className={column.className}>
                {i === 0 ? (
                  <>
                    <Bar width={WIDTHS[row]} />
                    <Bar width="w-1/3" className="mt-1 md:hidden" />
                  </>
                ) : column.label ? (
                  <Bar width={column.className?.includes("text-right") ? "ml-auto w-10" : "w-16"} />
                ) : null}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </TableShell>
  )
}
