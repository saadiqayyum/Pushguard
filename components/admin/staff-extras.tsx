"use client"

import { FlaskConical, Loader2 } from "lucide-react"
import { FixtureResults, type FixtureRun } from "@/components/admin/fixture-results"
import { LinkListEditor } from "@/components/admin/link-list-editor"
import { Markdown } from "@/components/admin/markdown"
import { YamlField } from "@/components/admin/yaml-field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import type { StaffExtras } from "@/lib/rules/staff-draft"
import { MAX_EXPLANATION, type Fixture } from "@/schemas/staff-rule"

type Row = Record<string, string | undefined>
type Fixtures = { malicious?: Fixture[]; benign?: Fixture[] }

const INCIDENT_FIELDS = [
  { key: "name", label: "Name" },
  { key: "date", label: "YYYY-MM-DD" },
  { key: "url", label: "https://" },
  { key: "note", label: "Note", optional: true },
]
const REFERENCE_FIELDS = [
  { key: "title", label: "Title" },
  { key: "url", label: "https://" },
]

export function StaffExtrasEditor({
  pack,
  packLocked,
  packs,
  extras,
  run,
  problems,
  running,
  onPack,
  onChange,
  onRun,
}: {
  pack?: string
  packLocked: boolean
  packs: { id: string; title: string }[]
  extras: StaffExtras
  run: FixtureRun | null
  problems: string[]
  running: boolean
  onPack: (pack: string) => void
  onChange: (extras: StaffExtras) => void
  onRun: () => void
}) {
  const set = (patch: Partial<StaffExtras>) => onChange({ ...extras, ...patch })
  const fixtures: Fixtures = extras.fixtures ?? {}
  const setFixtures = (patch: Fixtures) => {
    const next = { ...fixtures, ...patch }
    set({
      fixtures: next.malicious || next.benign ? (next as StaffExtras["fixtures"]) : undefined,
    })
  }
  const explanation = extras.explanation ?? ""

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="staff-pack">Pack</Label>
        <Select value={pack ?? ""} onValueChange={onPack} disabled={packLocked}>
          <SelectTrigger id="staff-pack" size="sm" className="w-full sm:max-w-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {packs.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="write" className="gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="staff-explanation">Explanation</Label>
          <TabsList>
            <TabsTrigger value="write">Write</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="write">
          <Textarea
            id="staff-explanation"
            rows={10}
            maxLength={MAX_EXPLANATION}
            value={explanation}
            onChange={(e) => set({ explanation: e.target.value || undefined })}
            className="font-mono text-xs"
          />
        </TabsContent>
        <TabsContent value="preview" className="min-h-40 rounded-lg border p-4">
          {explanation ? <Markdown>{explanation}</Markdown> : <p className="text-sm text-muted-foreground">No explanation</p>}
        </TabsContent>
      </Tabs>

      <LinkListEditor
        legend="Incidents"
        addLabel="Add incident"
        fields={INCIDENT_FIELDS}
        rows={(extras.incidents ?? []) as Row[]}
        onChange={(rows) =>
          set({
            incidents: rows.length ? (rows as StaffExtras["incidents"]) : undefined,
          })
        }
      />
      <LinkListEditor
        legend="References"
        addLabel="Add reference"
        fields={REFERENCE_FIELDS}
        rows={(extras.references ?? []) as Row[]}
        onChange={(rows) =>
          set({
            references: rows.length ? (rows as StaffExtras["references"]) : undefined,
          })
        }
      />

      <fieldset className="space-y-3">
        <legend className="mb-3 text-sm font-medium">Test cases</legend>
        <div className="grid gap-4 lg:grid-cols-2">
          <YamlField id="staff-malicious" label="Malicious (must hit)" value={fixtures.malicious} onChange={(v) => setFixtures({ malicious: v as Fixture[] | undefined })} rows={12} />
          <YamlField id="staff-benign" label="Benign (must not hit)" value={fixtures.benign} onChange={(v) => setFixtures({ benign: v as Fixture[] | undefined })} rows={12} />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onRun} disabled={running} aria-busy={running}>
          {running ? <Loader2 className="animate-spin" /> : <FlaskConical />}
          Run test cases
        </Button>
        {problems.length > 0 && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              <ul className="list-disc space-y-0.5 pl-4">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        {run && <FixtureResults run={run} />}
      </fieldset>
    </div>
  )
}
