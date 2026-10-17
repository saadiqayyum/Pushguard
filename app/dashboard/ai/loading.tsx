import { Gauge, KeyRound, Plus } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/page-skeleton"
import { AI_KEY_COLUMNS } from "@/components/table-columns"
import { TableToolbar } from "@/components/table-toolbar"
import { Button } from "@/components/ui/button"

export default function AiLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <PageHeader
        title="AI"
        actions={
          <>
            <Button size="sm" variant="outline" disabled>
              <Gauge className="size-4" />
              Budget
            </Button>
            <Button size="sm" variant="outline" disabled>
              <KeyRound className="size-4" />
              MCP tokens
            </Button>
            <Button size="sm" disabled>
              <Plus className="size-4" />
              New key
            </Button>
          </>
        }
      />
      <div className="space-y-4">
        <TableToolbar count={null} noun="key" />
        <TableSkeleton columns={AI_KEY_COLUMNS} />
      </div>
    </div>
  )
}
