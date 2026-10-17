import { DetailSkeleton } from "@/components/detail-skeleton"
import { Bar } from "@/components/page-skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

const ROWS = ["w-40", "w-24", "w-10", "w-28"]

// Shaped like the alert page with a push, the common case: badges, title, meta line, then the push card.
export default function AlertLoading() {
  return (
    <DetailSkeleton
      back={{ href: "/dashboard/alerts", label: "Alerts" }}
      header={
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-5 w-14 rounded-4xl" />
            <Skeleton className="h-5 w-12 rounded-4xl" />
            <Bar width="w-20" />
          </div>
          <Bar width="w-96 max-w-full" className="h-8" />
          <Bar width="w-64 max-w-full" />
        </>
      }
    >
      <Card>
        <CardHeader>
          <Bar width="w-24" className="h-[1.375rem]" />
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          {ROWS.map((width) => (
            <div key={width} className="flex flex-col gap-0.5 sm:flex-row sm:gap-6">
              <Bar width="w-20" className="shrink-0 sm:w-36" />
              <Bar width={width} />
            </div>
          ))}
        </CardContent>
      </Card>
    </DetailSkeleton>
  )
}
