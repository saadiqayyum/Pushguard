import { Plus } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/page-skeleton"
import { SCAN_COLUMNS } from "@/components/table-columns"
import { TableToolbar } from "@/components/table-toolbar"
import { Button } from "@/components/ui/button"

export default function ScansLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <PageHeader
        title="Scans"
        actions={
          <Button size="sm" disabled>
            <Plus className="size-4" />
            New scan
          </Button>
        }
      />
      <div className="space-y-4">
        <TableToolbar count={null} noun="scan" />
        <TableSkeleton columns={SCAN_COLUMNS} />
      </div>
    </div>
  )
}
