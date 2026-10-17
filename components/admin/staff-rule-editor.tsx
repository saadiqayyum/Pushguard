"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import type { FixtureRun } from "@/components/admin/fixture-results"
import { StaffExtrasEditor } from "@/components/admin/staff-extras"
import { RuleEditor, RuleIdentity, useRuleDraft } from "@/components/rules/rule-editor"
import { Button } from "@/components/ui/button"
import { api, ApiClientError } from "@/lib/api-client"
import { blankDraft, ruleToDraft, serverErrors } from "@/lib/rules/draft"
import { joinStaffRule, splitStaffRule, type StaffExtras } from "@/lib/rules/staff-draft"

const DEFAULT_PACK = "core"
const TEMPLATE: StaffExtras = {
  fixtures: {
    malicious: [
      {
        name: "matches",
        commits: [
          {
            files: [{ path: "index.js", change: "added", added: ["example"] }],
          },
        ],
      },
    ],
    benign: [
      {
        name: "near miss",
        commits: [{ files: [{ path: "index.js", change: "added", added: ["sample"] }] }],
      },
    ],
  },
}

export function StaffRuleEditor({
  initial,
  isNew,
  shipped,
  packs,
  checks,
  nextVersion,
}: {
  initial: Record<string, unknown> | null
  isNew: boolean
  shipped: boolean
  packs: { id: string; title: string }[]
  checks: string[]
  nextVersion?: number
}) {
  const router = useRouter()
  const [split] = useState(() => (initial ? splitStaffRule(initial) : null))
  const state = useRuleDraft(() => (split ? ruleToDraft(split.rule) : { ...blankDraft(), pack: DEFAULT_PACK }), Boolean(split?.rule.id))
  const [extras, setExtras] = useState<StaffExtras>(split?.extras ?? TEMPLATE)
  const [busy, setBusy] = useState<"save" | "fixtures" | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [run, setRun] = useState<FixtureRun | null>(null)
  const { built } = state

  function joined() {
    state.setAttempted(true)
    return built.rule ? joinStaffRule(built.rule, extras) : null
  }

  async function save() {
    const rule = joined()
    if (!rule) return
    setBusy("save")
    try {
      const saved = await api<{ id: string; version: number }>("/api/admin/rules", { method: "POST", body: { rule, isNew } })
      toast.success(`Saved ${saved.id} v${saved.version} as draft`)
      router.push(`/admin/rules/${saved.id}`)
      router.refresh()
    } catch (cause) {
      const message = cause instanceof ApiClientError ? cause.message : "Could not save"
      const located = serverErrors(message)
      if (located) state.setRemote(located)
      toast.error(located ? "Fix the highlighted fields" : message)
    } finally {
      setBusy(null)
    }
  }

  async function runFixtures() {
    const rule = joined()
    if (!rule) return
    setBusy("fixtures")
    setRun(null)
    try {
      const result = await api<{
        problems: string[]
        fixtures: FixtureRun | null
      }>("/api/admin/rules/fixtures", { method: "POST", body: { rule } })
      setProblems(result.problems)
      setRun(result.fixtures)
    } catch (cause) {
      toast.error(cause instanceof ApiClientError ? cause.message : "Could not run test cases")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="max-w-2xl rounded-lg border">
      <div className="space-y-4 border-b p-4 sm:px-6">
        <RuleIdentity state={state} editing={!isNew} readOnly={false} />
      </div>

      <div className="space-y-5 p-4 sm:px-6">
        <RuleEditor state={state} readOnly={false} scopeOptions={[]} checks={checks} />
      </div>

      <section aria-labelledby="staff-fields" className="space-y-4 border-t p-4 sm:px-6">
        <h2 id="staff-fields" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Staff
        </h2>
        <StaffExtrasEditor
          pack={state.draft.pack}
          packLocked={shipped}
          packs={packs}
          extras={extras}
          run={run}
          problems={problems}
          running={busy === "fixtures"}
          onPack={(pack) => state.patch({ pack })}
          onChange={setExtras}
          onRun={runFixtures}
        />
      </section>

      <div className="flex flex-wrap items-center gap-2 border-t p-4 sm:px-6">
        {nextVersion && <span className="text-xs text-muted-foreground tabular-nums">Saves as draft v{nextVersion}</span>}
        <div className="ml-auto flex items-center gap-2">
          {state.invalid && state.attempted && <span className="text-xs text-destructive">Fix the highlighted fields</span>}
          <Button type="button" onClick={save} disabled={busy !== null} aria-busy={busy === "save"}>
            Save draft
          </Button>
        </div>
      </div>
    </div>
  )
}
