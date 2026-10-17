import Link from "next/link"
import { Archive } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/page-skeleton"
import { ALERT_COLUMNS } from "@/components/table-columns"
import { TableToolbar } from "@/components/table-toolbar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { TableHead } from "@/components/ui/table"

export default function AlertsLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <PageHeader title="Alerts" />
      <div className="space-y-4">
        <TableToolbar count={null} noun="alert">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/alerts?archived=1">
              <Archive className="size-4" />
              Archived
            </Link>
          </Button>
        </TableToolbar>
        <TableSkeleton
          columns={ALERT_COLUMNS}
          lead={
            <TableHead className="w-10">
              <Checkbox disabled aria-label="Select all" />
            </TableHead>
          }
        />
      </div>
    </div>
  )
}
