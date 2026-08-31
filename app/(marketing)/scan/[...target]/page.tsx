import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { ScanPicker } from "@/components/scan-panel"
import { auth } from "@/lib/auth"
import { SCAN_COMMIT_WINDOW } from "@/lib/paging"
import { installUrl } from "@/lib/install-url"
import { parseScanIntent } from "@/lib/scan-intent"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Scan. Pushguard" }

// `/scan/owner` and `/scan/owner/repo`.
export default async function ScanIntentPage({
  params,
}: {
  params: Promise<{ target: string[] }>
}) {
  const intent = parseScanIntent((await params).target)
  if (!intent) notFound()

  if (!(await auth())?.user) {
    redirect(`/api/scan-intent?target=${encodeURIComponent(intent.repo ?? intent.account)}`)
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 pt-16 pb-8 sm:pt-20">
      <p className="eyebrow">Scan</p>
      <h1 className="mono mt-5 text-3xl font-semibold tracking-tight break-all sm:text-4xl">
        {intent.repo ?? intent.account}
      </h1>
      <p className="mt-5 max-w-xl text-sm leading-relaxed text-[var(--ink-soft)]">
        Reads up to {SCAN_COMMIT_WINDOW} commits on the default branch and reports what the rules
        flag. Pattern rules run on every scan; AI rules run too once the account has a model key.
        Nothing is filed on GitHub until you say so.
      </p>

      <div className="mt-9">
        <ScanPicker
          installUrl={installUrl()}
          initialAccount={intent.account}
          initialRepo={intent.repo}
        />
      </div>
    </div>
  )
}
