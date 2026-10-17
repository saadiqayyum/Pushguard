import { PageHeader } from "@/components/page-header"
import { Pager } from "@/components/pager"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { asSystem, platformAuditPage } from "@/lib/db"
import { parsePaging } from "@/lib/paging"
import { requirePlatformAdmin } from "@/lib/platform/auth"
import { AUDIT_PAGE_SIZE } from "@/lib/platform/limits"

export const dynamic = "force-dynamic"

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requirePlatformAdmin()
  const paging = parsePaging({ page: (await searchParams).page }, AUDIT_PAGE_SIZE)
  const { rows, total } = await asSystem(() => platformAuditPage(paging.skip, paging.perPage))

  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" description="Every change made in the console." />
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No changes recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When (UTC)</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead className="hidden lg:table-cell">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-xs">{row.at.toISOString().slice(0, 19).replace("T", " ")}</TableCell>
                  <TableCell className="font-mono text-xs">{row.actor}</TableCell>
                  <TableCell className="text-xs">{row.action}</TableCell>
                  <TableCell className="font-mono text-xs">{row.target}</TableCell>
                  <TableCell className="hidden max-w-md truncate font-mono text-xs text-muted-foreground lg:table-cell">{JSON.stringify(row.details)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pager page={paging.page} perPage={paging.perPage} total={total} hasMore={paging.skip + rows.length < total} basePath="/admin/audit" />
    </div>
  )
}
