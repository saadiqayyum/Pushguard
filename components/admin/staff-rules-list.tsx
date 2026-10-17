"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/admin/status-badge"
import type { PatternRow } from "@/components/rule-types"
import { RuleLine, RuleSection, ruleName, ruleSummary } from "@/components/rules/rule-section"
import { RulesFilter } from "@/components/rules/rules-toolbar"
import type { Severity } from "@/schemas/rule"

export type StaffListRow = PatternRow & {
  version: number | null
  status: string | null
}

export function StaffRulesList({ rows, packs }: { rows: StaffListRow[]; packs: { id: string; title: string }[] }) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [severities, setSeverities] = useState<Set<Severity>>(new Set())
  const [open, setOpen] = useState<Set<string>>(new Set())

  const needle = query.trim().toLowerCase()
  const filtering = Boolean(needle) || severities.size > 0
  const visible = (row: StaffListRow) =>
    (severities.size === 0 || severities.has(row.body.severity)) && (!needle || `${row.ruleId} ${ruleName(row)} ${ruleSummary(row)}`.toLowerCase().includes(needle))
  const sections = packs
    .map((p) => ({ ...p, rows: rows.filter((r) => r.pack === p.id) }))
    .map((s) => ({ ...s, hits: s.rows.filter(visible) }))
    .filter((s) => s.rows.length > 0 && (!filtering || s.hits.length > 0))

  return (
    <>
      <RulesFilter query={query} onQuery={setQuery} severities={severities} onSeverities={setSeverities} />
      {sections.length === 0 ? (
        <div className="rounded-lg border py-12 text-center">
          <p className="text-sm text-muted-foreground">No rules match</p>
          <Button variant="link" size="sm" onClick={() => (setQuery(""), setSeverities(new Set()))}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border">
          {sections.map((section) => (
            <RuleSection
              key={section.id}
              title={section.title}
              meta={`${section.rows.length} rule${section.rows.length === 1 ? "" : "s"}`}
              open={filtering || open.has(section.id)}
              onOpenChange={(isOpen) => setOpen((prev) => (isOpen ? new Set(prev).add(section.id) : new Set([...prev].filter((id) => id !== section.id))))}
              readOnly
            >
              {section.hits.map((row) => (
                <RuleLine
                  key={row.id}
                  row={row}
                  readOnly
                  locked={false}
                  onOpen={() => router.push(`/admin/rules/${row.ruleId}`)}
                  badge={
                    row.status && (
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="text-xs text-muted-foreground tabular-nums">v{row.version}</span>
                        <StatusBadge status={row.status} />
                      </span>
                    )
                  }
                />
              ))}
            </RuleSection>
          ))}
        </div>
      )}
    </>
  )
}
