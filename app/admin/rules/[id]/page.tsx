import { notFound } from "next/navigation"
import { StaffRuleEditor } from "@/components/admin/staff-rule-editor"
import { StatusBadge } from "@/components/admin/status-badge"
import { StatusBar } from "@/components/admin/status-bar"
import { TransitionControls } from "@/components/admin/transition-controls"
import { VersionDiff } from "@/components/admin/version-diff"
import { PageHeader } from "@/components/page-header"
import { asSystem, contributorDraftById, platformRuleVersions, publishedCheckIds } from "@/lib/db"
import { requirePlatformAdmin } from "@/lib/platform/auth"
import { catalogById, PACKS } from "@/lib/rules/catalog"

export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const versionMeta = (v: { createdBy: string; createdAt: Date; signedBy: string | null }) => `${v.createdBy}, ${v.createdAt.toISOString().slice(0, 10)}${v.signedBy ? `, signed by ${v.signedBy}` : ""}`
const packs = PACKS.map((p) => ({ id: p.id, title: p.title }))

export default async function StaffRulePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ draft?: string }> }) {
  await requirePlatformAdmin()
  const { id } = await params
  const checks = await asSystem(() => publishedCheckIds())

  if (id === "new") {
    const draftId = (await searchParams).draft
    const draft = draftId && UUID.test(draftId) ? await asSystem(() => contributorDraftById(draftId)) : null
    return (
      <div className="space-y-6">
        <PageHeader title="New rule" description={draft ? `From the inbox: ${draft.title}` : undefined} />
        <StaffRuleEditor initial={draft?.body ?? null} isNew shipped={false} packs={packs} checks={checks} />
      </div>
    )
  }

  const shipped = catalogById.get(id)
  const versions = await asSystem(() => platformRuleVersions(id))
  const [latest, previous] = versions
  if (!latest && !shipped) notFound()
  const before = previous ? { body: previous.body, label: `v${previous.version}` } : shipped && { body: shipped, label: "the shipped rule" }

  return (
    <div className="space-y-8">
      <PageHeader title={<span className="font-mono">{id}</span>} description={(latest?.body ?? shipped)?.description} />

      {latest && <StatusBar id={latest.id} version={latest.version} status={latest.status} meta={versionMeta(latest)} />}

      <StaffRuleEditor
        key={latest ? `${latest.version}-${latest.status}` : "shipped"}
        initial={latest?.body ?? shipped ?? null}
        isNew={false}
        shipped={Boolean(shipped)}
        packs={packs}
        checks={checks}
        nextVersion={latest && latest.status !== "draft" ? latest.version + 1 : undefined}
      />

      {versions.length > 1 && (
        <section aria-labelledby="versions" className="space-y-3">
          <h2 id="versions" className="text-base font-semibold">
            Versions
          </h2>
          <ul className="divide-y rounded-lg border">
            {versions.slice(1).map((v) => (
              <li key={v.version} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium tabular-nums">v{v.version}</span>
                  <StatusBadge status={v.status} />
                  <span className="text-muted-foreground">{versionMeta(v)}</span>
                </div>
                <TransitionControls kind="rule" id={v.id} version={v.version} status={v.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {latest && before && (
        <section aria-labelledby="diff" className="space-y-3">
          <h2 id="diff" className="text-base font-semibold">
            v{latest.version} against {before.label}
          </h2>
          <VersionDiff before={before.body} after={latest.body} label={before.label} />
        </section>
      )}
    </div>
  )
}
