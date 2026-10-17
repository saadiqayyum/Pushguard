import Link from "next/link"
import { ContributorForm } from "@/components/admin/contributor-form"
import { FixtureResults, type FixtureRun } from "@/components/admin/fixture-results"
import { InboxStateButton } from "@/components/admin/inbox-state-button"
import { PageHeader } from "@/components/page-header"
import { Pager } from "@/components/pager"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { listAttackDocs } from "@/lib/contributor/docs"
import { CONTRIBUTOR_TEXT_MAX, CONTRIBUTOR_URLS_MAX } from "@/lib/contributor/limits"
import { platformModel } from "@/lib/contributor/model"
import { asSystem, contributorDraftsPage } from "@/lib/db"
import { parsePaging } from "@/lib/paging"
import { requirePlatformAdmin } from "@/lib/platform/auth"
import { ADMIN_LIST_PAGE_SIZE } from "@/lib/platform/limits"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ page?: string; state?: string }> }) {
  await requirePlatformAdmin()
  const params = await searchParams
  const state = params.state === "dismissed" ? "dismissed" : "new"
  const paging = parsePaging({ page: params.page }, ADMIN_LIST_PAGE_SIZE)
  const [{ rows, total }, docs] = await Promise.all([asSystem(() => contributorDraftsPage(state, paging.skip, paging.perPage)), listAttackDocs()])
  const enabled = platformModel() !== null

  return (
    <div className="space-y-6">
      <PageHeader title="Contributor inbox" />
      {enabled ? (
        <ContributorForm docs={docs} maxText={CONTRIBUTOR_TEXT_MAX} maxUrls={CONTRIBUTOR_URLS_MAX} />
      ) : (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">The AI security expert is off. Set PLATFORM_AI_KEY to turn it on.</p>
      )}

      <nav aria-label="Inbox state" className="flex gap-1">
        {(["new", "dismissed"] as const).map((s) => (
          <Link
            key={s}
            href={s === "new" ? "/admin/inbox" : "/admin/inbox?state=dismissed"}
            aria-current={s === state ? "page" : undefined}
            className={cn("rounded-md px-3 py-1.5 text-sm capitalize hover:bg-accent", s === state ? "bg-accent font-medium" : "text-muted-foreground")}
          >
            {s}
          </Link>
        ))}
      </nav>

      {rows.length === 0 && <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">Nothing {state === "new" ? "waiting" : "dismissed"}.</p>}
      <ul className="space-y-4">
        {rows.map((draft) => (
          <li key={draft.id} className="space-y-3 rounded-md border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <p className="font-medium break-words">{draft.title}</p>
                <p className="text-xs text-muted-foreground">
                  {draft.source}, requested by {draft.requestedBy}, {draft.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={draft.valid ? "secondary" : "destructive"}>{draft.valid ? "valid" : "invalid"}</Badge>
                <InboxStateButton id={draft.id} state={state} />
              </div>
            </div>
            {draft.problems.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-destructive">
                {draft.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            {draft.droppedUrls.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Removed {draft.droppedUrls.length} citation(s) not found in the input:{" "}
                <span className="break-all font-mono">{draft.droppedUrls.join(", ")}</span>
              </p>
            )}
            {draft.reasoning && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">Reasoning</summary>
                <p className="mt-2 whitespace-pre-wrap">{draft.reasoning}</p>
              </details>
            )}
            {draft.fixtureResults ? <FixtureResults run={draft.fixtureResults as FixtureRun} /> : null}
            <div className="flex flex-wrap gap-2">
              {draft.ruleId ? (
                <Button asChild size="sm">
                  <Link href={`/admin/rules/${draft.ruleId}`}>Open draft v{draft.ruleVersion}</Link>
                </Button>
              ) : draft.body ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/admin/rules/new?draft=${draft.id}`}>Open in editor</Link>
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <Pager
        page={paging.page}
        perPage={paging.perPage}
        total={total}
        hasMore={paging.skip + rows.length < total}
        basePath={state === "new" ? "/admin/inbox" : "/admin/inbox?state=dismissed"}
      />
    </div>
  )
}
