import { Badge } from "@/components/ui/badge"
import { TableShell } from "@/components/table-shell"
import { TableToolbar } from "@/components/table-toolbar"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatTimestamp } from "@/lib/format"

export type PullRequestRow = {
  id: string
  repo: string
  number: number
  title: string
  author: string
  headRef: string
  baseRef: string
  draft: boolean
  url: string
  openAlerts: number
  updatedAt: string
}

export function PullRequestsView({
  rows,
  orgSwitcher,
}: {
  rows: PullRequestRow[]
  orgSwitcher?: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      <TableToolbar count={rows.length} noun="open pull request">
        {orgSwitcher}
      </TableToolbar>

      <TableShell minWidth="md:min-w-[900px]">
        <TableHeader>
          <TableRow>
            <TableHead>Pull request</TableHead>
            <TableHead className="hidden md:table-cell">Repository</TableHead>
            <TableHead className="hidden lg:table-cell">Branches</TableHead>
            <TableHead className="hidden md:table-cell">Author</TableHead>
            <TableHead className="hidden md:table-cell">Updated</TableHead>
            <TableHead className="text-right">Alerts</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                No open pull requests.
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <a href={row.url} target="_blank" rel="noreferrer" className="font-medium">
                    {row.title}
                  </a>
                  {row.draft && <Badge variant="outline">draft</Badge>}
                </span>
                <span className="mt-1 block font-mono text-xs break-all text-muted-foreground md:hidden">
                  {row.repo}#{row.number} · {row.headRef} into {row.baseRef}
                </span>
              </TableCell>
              <TableCell className="hidden font-mono text-xs whitespace-nowrap text-muted-foreground md:table-cell">
                {row.repo}#{row.number}
              </TableCell>
              <TableCell className="hidden font-mono text-xs whitespace-nowrap text-muted-foreground lg:table-cell">
                {row.headRef} into {row.baseRef}
              </TableCell>
              <TableCell className="hidden text-xs text-muted-foreground md:table-cell">@{row.author}</TableCell>
              <TableCell className="hidden text-xs whitespace-nowrap text-muted-foreground md:table-cell">
                {formatTimestamp(row.updatedAt)}
              </TableCell>
              <TableCell className="text-right text-sm">
                {row.openAlerts > 0 ? row.openAlerts : <span className="text-muted-foreground">clean</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </TableShell>
    </div>
  )
}
