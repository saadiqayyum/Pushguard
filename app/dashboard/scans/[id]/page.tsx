import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ScanReport } from "@/components/scan-panel"
import { auth } from "@/lib/auth"
import { scansCollection, serializeScan } from "@/lib/db"
import { installUrl } from "@/lib/install-url"
import { canReadScan } from "@/lib/scan"
import { formatTimestamp } from "@/lib/format"

export const dynamic = "force-dynamic"

export default async function ScanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user) redirect("/signin")

  const scan = await (await scansCollection()).findOne({ _id: id })
  // A scan quotes source from private repositories, so it is private to the
  // account that ran it. Not found and not yours look identical from here.
  if (!scan || !canReadScan(scan, session.login ?? null)) notFound()

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
