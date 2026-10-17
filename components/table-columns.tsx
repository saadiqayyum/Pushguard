import { TableHead, TableHeader, TableRow } from "@/components/ui/table"

export type Column = { label: string; className?: string }

const MD = "hidden md:table-cell"
const LG = "hidden lg:table-cell"

export const ALERT_COLUMNS: Column[] = [
  { label: "Alert" },
  { label: "Repository", className: MD },
  { label: "Branch", className: LG },
  { label: "Triage", className: LG },
  { label: "When", className: MD },
  { label: "State", className: "text-right" },
]

export const PR_COLUMNS: Column[] = [
  { label: "Pull request" },
  { label: "Repository", className: MD },
  { label: "Branches", className: LG },
  { label: "Author", className: MD },
  { label: "Updated", className: MD },
  { label: "Alerts", className: "text-right" },
]

export const SCAN_COLUMNS: Column[] = [
  { label: "Target" },
  { label: "Branch", className: LG },
  { label: "Read", className: MD },
  { label: "Started", className: MD },
  { label: "Findings", className: "text-right" },
]

export const AI_KEY_COLUMNS: Column[] = [
  { label: "Name" },
  { label: "Provider", className: "hidden sm:table-cell" },
  { label: "Model" },
  { label: "Key", className: MD },
  { label: "Default", className: "text-right" },
  { label: "", className: "w-10" },
]

// `lead` is an extra first header cell, such as a select-all checkbox.
export function TableColumns({ columns, lead }: { columns: Column[]; lead?: React.ReactNode }) {
  return (
    <TableHeader>
      <TableRow>
        {lead}
        {columns.map((column, i) => (
          <TableHead key={i} className={column.className}>
            {column.label}
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
  )
}
