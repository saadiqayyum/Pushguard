import Link from "next/link"
import { Plus } from "lucide-react"
import { StatusBadge } from "@/components/admin/status-badge"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { asSystem, latestCheckScripts } from "@/lib/db"
import { requirePlatformAdmin } from "@/lib/platform/auth"
import { ADMIN_LIST_PAGE_SIZE } from "@/lib/platform/limits"

export const dynamic = "force-dynamic"

export default async function ChecksPage() {
  await requirePlatformAdmin()
  const rows = await asSystem(() => latestCheckScripts(ADMIN_LIST_PAGE_SIZE))
  return (
    <div className="space-y-6">
      <PageHeader
        title="Checks"
        actions={
          <Button asChild size="sm">
            <Link href="/admin/checks/new">
              <Plus className="size-4" aria-hidden />
              New check
            </Link>
          </Button>
        }
      />
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No checks</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Check</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">sha256</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link href={`/admin/checks/${row.id}`} className="font-mono text-sm hover:underline">
                      {row.id}
                    </Link>
                  </TableCell>
                  <TableCell>{row.language}</TableCell>
                  <TableCell>v{row.version}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">{row.sha256.slice(0, 16)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {rows.length === ADMIN_LIST_PAGE_SIZE && <p className="text-xs text-muted-foreground">Showing the first {ADMIN_LIST_PAGE_SIZE}.</p>}
    </div>
  )
}
