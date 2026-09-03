"use client"

import { useMemo, useState } from "react"
import { FlaskConical, Save } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, ApiClientError } from "@/lib/api-client"
import { ruleSchema, SEVERITIES, type Rule, type Severity } from "@/schemas/rule"
import { ScopeSelect, type ScopeOption } from "@/components/scope-select"
import type { RuleRow } from "@/components/rule-types"

type ChangeType = "added" | "modified" | "removed"
const CHANGE_TYPES: ChangeType[] = ["added", "modified", "removed"]
type ChangeSource = "push" | "pull_request"
const SOURCE_LABELS: { value: ChangeSource; label: string }[] = [
  { value: "push", label: "Pushes" },
  { value: "pull_request", label: "Pull requests" },
]

type FormState = {
  id: string
  description: string
  severity: Severity
  repos: string[]
  on: ChangeSource[]
  branches: string
  baseBranches: string
  paths: string
  excludePaths: string
  changeTypes: ChangeType[]
  forced: "any" | "yes"
  addedLines: string
}

const INITIAL: FormState = {
  id: "",
  description: "",
  severity: "high",
  repos: [],
  on: ["push"],
  branches: "",
  baseBranches: "",
  paths: "",
  excludePaths: "",
  changeTypes: [...CHANGE_TYPES],
  forced: "any",
  addedLines: "",
}

// Reverse of buildRule, for editing and duplicating.
function toForm(rule: Rule): FormState {
  return {
    id: rule.id,
    description: rule.description ?? "",
    severity: rule.severity,
    repos: rule.repos ?? [],
    on: rule.on ?? ["push"],
    branches: (rule.branches ?? []).join("\n"),
    baseBranches: (rule.base_branches ?? []).join("\n"),
    paths: (rule.paths ?? []).join("\n"),
    excludePaths: (rule.exclude_paths ?? []).join("\n"),
    changeTypes: rule.change_type ?? [...CHANGE_TYPES],
    forced: rule.when?.forced ? "yes" : "any",
    addedLines: rule.added_lines ?? "",
  }
}

type TestResult = { matched: boolean; matchedFiles: string[]; matchedLines: string[] }

export type RuleFormMode =
  | { kind: "create" }
  | { kind: "edit"; docId: string; rule: Rule }
  | { kind: "duplicate"; rule: Rule }

export function RuleForm({
  mode = { kind: "create" },
  scopeOptions,
  onSaved,
}: {
  mode?: RuleFormMode
  scopeOptions: ScopeOption[]
  onSaved: (row: RuleRow, mode: RuleFormMode) => void
}) {
  const [form, setForm] = useState<FormState>(() =>
    mode.kind === "create"
      ? INITIAL
      : { ...toForm(mode.rule), id: mode.kind === "duplicate" ? `${mode.rule.id}-copy` : mode.rule.id },
  )
  const [saving, setSaving] = useState(false)
  const [testFiles, setTestFiles] = useState("")
  const [testDiff, setTestDiff] = useState("")
  const [testForced, setTestForced] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)

  const set = (key: keyof FormState) => (value: string) => setForm((f) => ({ ...f, [key]: value }))

  const base = mode.kind === "create" ? undefined : mode.rule
  const built = useMemo(() => buildRule(form, base), [form, base])

  async function submit() {
    if (!built.success) {
      toast.error(built.error)
      return
    }
    setSaving(true)
    try {
      const row =
        mode.kind === "edit"
          ? await api<RuleRow>(`/api/rules/${mode.docId}`, {
              method: "PATCH",
              body: { rule: built.rule },
            })
          : await api<RuleRow>("/api/rules", { method: "POST", body: { rule: built.rule } })
      toast.success(`Rule ${built.rule.id} ${mode.kind === "edit" ? "updated" : "created"}`)
      onSaved(row, mode)
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  async function runTest() {
    if (!built.success) {
      toast.error(built.error)
      return
    }
    try {
      const result = await api<TestResult>("/api/rules/test", {
        method: "POST",
        body: {
          rule: built.rule,
          sample: {
            forced: testForced,
            files: splitLines(testFiles).map((path) => ({ path, changeType: "modified" as const })),
            diff: testDiff || undefined,
          },
        },
      })
      setTestResult(result)
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Test failed")
    }
  }

  return (
    <Tabs defaultValue="define">
      <TabsList className="w-full">
        <TabsTrigger value="define" className="flex-1">
          Define
        </TabsTrigger>
        <TabsTrigger value="test" className="flex-1">
          Test
        </TabsTrigger>
      </TabsList>

      <TabsContent value="define" className="space-y-5 pt-4">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Rule id"
            hint={mode.kind === "edit" ? "fixed once created" : "kebab-case, unique"}
          >
            <Input
              value={form.id}
              onChange={(e) => set("id")(e.target.value)}
              placeholder="watch-auth-module"
              disabled={mode.kind === "edit"}
            />
          </Field>
          <Field label="Severity">
            <Select value={form.severity} onValueChange={(v) => set("severity")(v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="Description" hint="shown in the alert ticket">
          <Input value={form.description} onChange={(e) => set("description")(e.target.value)} />
        </Field>

        <Field label="Repositories and organizations">
          <ScopeSelect
            options={scopeOptions}
            selected={form.repos}
            onChange={(repos) => setForm((f) => ({ ...f, repos }))}
            addLabel="Add a repository or organization…"
            emptyLabel="Applies to every repository the app can see."
          />
        </Field>

        <Field label="Runs on" hint="pushes, pull requests, or both">
          <div className="flex flex-wrap gap-5 pt-1">
            {SOURCE_LABELS.map((source) => (
              <label key={source.value} className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.on.includes(source.value)}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({
                      ...f,
                      on: checked
                        ? [...f.on, source.value]
                        : f.on.filter((s) => s !== source.value),
                    }))
                  }
                />
                {source.label}
              </label>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Branches" hint="globs, one per line, empty = all">
            <Textarea rows={2} value={form.branches} onChange={(e) => set("branches")(e.target.value)} placeholder={"main\nrelease/*"} />
          </Field>
          {form.on.includes("pull_request") && (
            <Field label="Base branches" hint="globs, one per line, empty = all">
              <Textarea rows={2} value={form.baseBranches} onChange={(e) => set("baseBranches")(e.target.value)} placeholder={"main"} />
            </Field>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Paths" hint="changed-file globs, one per line">
            <Textarea rows={3} value={form.paths} onChange={(e) => set("paths")(e.target.value)} placeholder={"**/package.json\n.github/workflows/**"} />
          </Field>
          <Field label="Excluded paths" hint="requires paths">
            <Textarea rows={3} value={form.excludePaths} onChange={(e) => set("excludePaths")(e.target.value)} placeholder="**/.env.example" />
          </Field>
        </div>

        <Field label="Change types" hint="which kinds of file change count">
          <div className="flex flex-wrap gap-5 pt-1">
            {CHANGE_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.changeTypes.includes(type)}
                  onCheckedChange={(on) =>
                    setForm((f) => ({
                      ...f,
                      changeTypes: on
                        ? [...f.changeTypes, type]
                        : f.changeTypes.filter((t) => t !== type),
                    }))
                  }
                />
                {type}
              </label>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Force push" hint="condition on the push itself">
            <Select value={form.forced} onValueChange={(v) => set("forced")(v)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any push</SelectItem>
                <SelectItem value="yes">Force pushes only</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Added-lines regex" hint="matched against + lines of the diff">
            <Input
              value={form.addedLines}
              onChange={(e) => set("addedLines")(e.target.value)}
              placeholder={'"postinstall"\\s*:'}
              className="font-mono"
            />
          </Field>
        </div>

        {!built.success && form.id !== "" && <p className="text-xs text-destructive">{built.error}</p>}

        <div className="flex justify-end pt-1">
          <Button onClick={submit} disabled={saving || !built.success}>
            <Save className="size-4" />
            {mode.kind === "edit" ? "Save changes" : "Create rule"}
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="test" className="space-y-5 pt-4">
        <Field label="Changed files" hint="one path per line">
          <Textarea rows={3} value={testFiles} onChange={(e) => setTestFiles(e.target.value)} placeholder="package.json" />
        </Field>
        <Field label="Sample diff" hint="optional, unified diff or pasted + lines">
          <Textarea rows={5} value={testDiff} onChange={(e) => setTestDiff(e.target.value)} className="font-mono" />
        </Field>
        <div className="flex items-center gap-2">
          <Switch checked={testForced} onCheckedChange={setTestForced} id="test-forced" />
          <Label htmlFor="test-forced" className="text-sm">
            Simulate force push
          </Label>
        </div>
        <div className="flex justify-end pt-1">
          <Button variant="outline" onClick={runTest} disabled={!built.success}>
            <FlaskConical className="size-4" />
            Run test
          </Button>
        </div>
        {testResult && (
          <div className="rounded-md border p-3 text-sm">
            <p className={testResult.matched ? "font-medium text-destructive" : "font-medium"}>
              {testResult.matched ? "Rule would fire" : "Rule would not fire"}
            </p>
            {testResult.matchedFiles.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">Files: {testResult.matchedFiles.join(", ")}</p>
            )}
            {testResult.matchedLines.length > 0 && (
              <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted p-2 text-xs">
                {testResult.matchedLines.join("\n")}
              </pre>
            )}
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function buildRule(
  form: FormState,
  base?: Rule,
): { success: true; rule: Rule } | { success: false; error: string } {
  // Only keys the schema knows. The catalog browser tags rows with `kind` and
  // `pack` so it can group them, and `ruleSchema` is strict, so spreading the
  // source object wholesale turned "duplicate this rule" into a rejected save.
  const known = new Set(Object.keys(ruleSchema.shape))
  const candidate: Record<string, unknown> = Object.fromEntries(
    Object.entries(base ?? {}).filter(([field]) => known.has(field)),
  )
  candidate.id = form.id
  candidate.severity = form.severity
  candidate.enabled = base?.enabled ?? true

  const assign = (key: string, value: unknown) => {
    if (value === undefined) delete candidate[key]
    else candidate[key] = value
  }

  assign("description", form.description || undefined)
  assign("repos", form.repos.length > 0 ? form.repos : undefined)
  assign(
    "on",
    form.on.length === 1 && form.on[0] === "push" ? undefined : [...form.on].sort(),
  )
  assign("branches", splitLines(form.branches).length > 0 ? splitLines(form.branches) : undefined)
  assign(
    "base_branches",
    form.on.includes("pull_request") && splitLines(form.baseBranches).length > 0
      ? splitLines(form.baseBranches)
      : undefined,
  )
  assign("paths", splitLines(form.paths).length > 0 ? splitLines(form.paths) : undefined)
  assign(
    "exclude_paths",
    splitLines(form.excludePaths).length > 0 ? splitLines(form.excludePaths) : undefined,
  )
  assign(
    "change_type",
    form.changeTypes.length > 0 && form.changeTypes.length < CHANGE_TYPES.length
      ? CHANGE_TYPES.filter((t) => form.changeTypes.includes(t))
      : undefined,
  )
  assign("added_lines", form.addedLines || undefined)

  const when: Record<string, unknown> = { ...(base?.when ?? {}) }
  if (form.forced === "yes") when.forced = true
  else delete when.forced
  assign("when", Object.keys(when).length > 0 ? when : undefined)

  if (form.changeTypes.length === 0) {
    return { success: false, error: "change_type: select at least one change type" }
  }
  if (form.on.length === 0) {
    return { success: false, error: "on: pick pushes, pull requests, or both" }
  }

  const parsed = ruleSchema.safeParse(candidate)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      success: false,
      error: issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
    }
  }
  return { success: true, rule: parsed.data }
}
