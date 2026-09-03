import Link from "next/link"
import { notFound } from "next/navigation"
import { ScanReport } from "@/components/scan-panel"
import { pageMember } from "@/lib/auth"
import { serializeScan } from "@/lib/db"
import { installUrl } from "@/lib/install-url"
import { readableScan } from "@/lib/scan"
import { formatTimestamp } from "@/lib/format"

export const dynamic = "force-dynamic"

export default async function ScanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { login } = await pageMember()
  const scan = await readableScan(id, login)
  if (!scan) notFound()

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{scan.target}</h1>
        <p className="text-sm text-muted-foreground">
          {(scan.scanned?.length ?? 0) > 0
            ? `${scan.scanned!.length} ${scan.scanned!.length === 1 ? "repository" : "repositories"}, ${scan.scanned!.reduce((n, r) => n + r.commits, 0)} commits read`
            : "Recorded before branch details were kept"}
          {" · "}
          {formatTimestamp(scan.createdAt)}
        </p>
      </div>

      <ScanReport initial={serializeScan(scan)} installUrl={installUrl()} />

      <p className="text-sm text-muted-foreground">
        <Link href="/dashboard/scans" className="underline">
          All scans
        </Link>
      </p>
    </div>
  )
}
