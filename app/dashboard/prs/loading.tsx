import { PageHeader } from "@/components/page-header"
import { TableSkeleton } from "@/components/page-skeleton"
import { PR_COLUMNS } from "@/components/table-columns"
import { TableToolbar } from "@/components/table-toolbar"

export default function PullRequestsLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <PageHeader title="Pull requests" />
      <div className="space-y-4">
        <TableToolbar count={null} noun="open pull request" />
        <TableSkeleton columns={PR_COLUMNS} />
      </div>
    </div>
  )
}
