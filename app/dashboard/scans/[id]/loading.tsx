import { DetailSkeleton } from "@/components/detail-skeleton"
import { PageHeader } from "@/components/page-header"
import { Bar } from "@/components/page-skeleton"
import { Skeleton } from "@/components/ui/skeleton"

// Mirrors ScanReport's card: a two-line header with the status pill, then one repository block.
export default function ScanLoading() {
  return (
    <DetailSkeleton
      back={{ href: "/dashboard/scans", label: "Scans" }}
      header={<PageHeader title={<Bar width="w-72 max-w-full" className="h-8" />} description={<Bar width="w-48 max-w-full" />} />}
    >
      <section className="overflow-hidden rounded-lg border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <Bar width="w-48 max-w-full" />
            <Bar width="w-32" className="h-4" />
          </div>
          <Skeleton className="h-6 w-20 rounded-md" />
        </header>
        <div className="px-4 py-4">
          <Bar width="w-56 max-w-full" />
        </div>
      </section>
    </DetailSkeleton>
  )
}
