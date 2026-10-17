import { notFound } from "next/navigation"
import { CheckEditor } from "@/components/admin/check-editor"
import { StatusBadge } from "@/components/admin/status-badge"
import { TransitionControls } from "@/components/admin/transition-controls"
import { VersionDiff } from "@/components/admin/version-diff"
import { PageHeader } from "@/components/page-header"
import { asSystem, checkScriptVersions } from "@/lib/db"
import { requirePlatformAdmin } from "@/lib/platform/auth"
import type { Status } from "@/lib/platform/lifecycle"
import { CHECK_LANGUAGES } from "@/schemas/staff-rule"

export const dynamic = "force-dynamic"

export default async function CheckPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformAdmin()
  const { id } = await params
  if (id === "new") {
    return (
      <div className="space-y-6">
        <PageHeader title="New check" />
        <CheckEditor initial={{ id: "", language: CHECK_LANGUAGES[0], body: "" }} isNew languages={CHECK_LANGUAGES} />
      </div>
    )
  }

  const versions = await asSystem(() => checkScriptVersions(id))
  const [latest, previous] = versions
  if (!latest) notFound()

  return (
    <div className="space-y-8">
      <PageHeader title={<span className="font-mono">{latest.id}</span>} />
      <section aria-labelledby="versions" className="space-y-3">
        <h2 id="versions" className="text-base font-semibold">
          Versions
        </h2>
        <ul className="divide-y rounded-md border">
          {versions.map((v) => (
            <li key={v.version} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">v{v.version}</span>
                  <StatusBadge status={v.status} />
                  <span className="text-muted-foreground">{v.language}</span>
                </div>
                <p className="break-all font-mono text-xs text-muted-foreground">sha256 {v.sha256}</p>
              </div>
              <TransitionControls kind="check" id={v.id} version={v.version} status={v.status as Status} />
            </li>
          ))}
        </ul>
      </section>
      {previous && (
        <section aria-labelledby="diff" className="space-y-3">
          <h2 id="diff" className="text-base font-semibold">
            Changes in v{latest.version}
          </h2>
          <VersionDiff before={previous.body} after={latest.body} label={`v${previous.version}`} />
        </section>
      )}
      <section aria-labelledby="edit" className="space-y-3">
        <h2 id="edit" className="text-base font-semibold">
          Edit
        </h2>
        <CheckEditor
          key={`${latest.version}-${latest.status}`}
          initial={{ id: latest.id, language: latest.language, body: latest.body }}
          isNew={false}
          languages={CHECK_LANGUAGES}
          note={latest.status === "draft" ? undefined : `Saving creates draft v${latest.version + 1}.`}
        />
      </section>
    </div>
  )
}
