import { cn } from "@/lib/utils"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

export function Pager({
  page,
  perPage,
  total,
  hasMore,
  basePath,
}: {
  page: number
  perPage: number
  total: number
  hasMore: boolean
  basePath: string
}) {
  if (page === 1 && !hasMore) return null

  const first = total === 0 ? 0 : (page - 1) * perPage + 1
  const last = Math.min(page * perPage, total)
  const join = basePath.includes("?") ? "&" : "?"
  const href = (target: number) => (target === 1 ? basePath : `${basePath}${join}page=${target}`)

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">
        {first}–{last} of {total}
      </span>
      <Pagination className="mx-0 w-auto justify-end">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href={page > 1 ? href(page - 1) : undefined}
              aria-disabled={page === 1}
              className={cn(page === 1 && "pointer-events-none opacity-50")}
            />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              href={hasMore ? href(page + 1) : undefined}
              aria-disabled={!hasMore}
              className={cn(!hasMore && "pointer-events-none opacity-50")}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}
