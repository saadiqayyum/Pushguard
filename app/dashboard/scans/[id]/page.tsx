import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { notFound } from "next/navigation"
import { PageHeader } from "@/components/page-header"
import { ScanReport } from "@/components/scan-panel"
import { pageMember } from "@/lib/auth"
import { readableScan, serializeScan, withUser } from "@/lib/db"
import { installUrl } from "@/lib/install-url"
import { formatTimestamp } from "@/lib/format"

export const dynamic = "force-dynamic"

export default async function ScanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { login } = await pageMember()
  const scan = await withUser(login, () => readableScan(id, login))
  if (!scan) notFound()

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/dashboard/scans"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Scans
        </Link>
        <PageHeader
          title={scan.target}
          description={
            <>
              {scan.scanned.length > 0 &&
                `${scan.scanned.length} ${scan.scanned.length === 1 ? "repository" : "repositories"}, ${scan.scanned.reduce((n, r) => n + r.commits, 0)} commits, `}
              {formatTimestamp(scan.createdAt)}
            </>
          }
        />
      </div>

      <ScanReport initial={serializeScan(scan)} installUrl={installUrl()} />
    </div>
  )
}
