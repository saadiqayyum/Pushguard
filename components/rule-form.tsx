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

type FormState = {
  id: string
  description: string
  severity: Severity
  repos: string[]
  branches: string
  paths: string
  excludePaths: string
  changeTypes: ChangeType[]
  forced: "any" | "yes"
  addedLines: string
  ai: string
}

const INITIAL: FormState = {
  id: "",
  description: "",
  severity: "high",
  repos: [],
  branches: "",
  paths: "",
  excludePaths: "",
  changeTypes: [...CHANGE_TYPES],
  forced: "any",
  addedLines: "",
  ai: "",
}

// Reverse of buildRule, for editing and duplicating.
function toForm(rule: Rule): FormState {
  return {
    id: rule.id,
    description: rule.description ?? "",
    severity: rule.severity,
    repos: rule.repos ?? [],
    branches: (rule.branches ?? []).join("\n"),
    paths: (rule.paths ?? []).join("\n"),
    excludePaths: (rule.exclude_paths ?? []).join("\n"),
    changeTypes: rule.change_type ?? [...CHANGE_TYPES],
    forced: rule.when?.forced ? "yes" : "any",
    addedLines: rule.added_lines ?? "",
    ai: rule.ai ?? "",
  }
}

type TestResult = { matched: boolean; matchedFiles: string[]; matchedLines: string[] }

export type RuleFormMode =
  | { kind: "create" }
  // Editing patches an existing document; the rule id is its stable key and
  // stays fixed. Duplicating starts a new rule from an existing one.
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

  // Editing and duplicating carry the original rule through so conditions the
  // form cannot express (hour_utc windows, branch created/deleted) survive a
  // round trip instead of being silently dropped.
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

        {/* Free text, not a picker: branch rules are usually patterns
            (release/*, feature/*) that no branch listing would contain. */}
        <Field label="Branches" hint="globs, one per line, empty = all">
          <Textarea rows={2} value={form.branches} onChange={(e) => set("branches")(e.target.value)} placeholder={"main\nrelease/*"} />
        </Field>

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

        <Field label="AI review question" hint="optional; Claude reviews the diff with this question">
          <Textarea rows={2} value={form.ai} onChange={(e) => set("ai")(e.target.value)} placeholder="Does this diff add code that executes on install?" />
        </Field>

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
  // Start from the original so fields this form has no control for
  // (when.hour_utc, when.branch_created/deleted) survive an edit.
  const candidate: Record<string, unknown> = { ...(base ?? {}) }
  candidate.id = form.id
  candidate.severity = form.severity
  candidate.enabled = base?.enabled ?? true

  const assign = (key: string, value: unknown) => {
    if (value === undefined) delete candidate[key]
    else candidate[key] = value
  }

  assign("description", form.description || undefined)
  assign("repos", form.repos.length > 0 ? form.repos : undefined)
  assign("branches", splitLines(form.branches).length > 0 ? splitLines(form.branches) : undefined)
  assign("paths", splitLines(form.paths).length > 0 ? splitLines(form.paths) : undefined)
  assign(
    "exclude_paths",
    splitLines(form.excludePaths).length > 0 ? splitLines(form.excludePaths) : undefined,
  )
  // All three selected is the schema default; omit it rather than store noise.
  assign(
    "change_type",
    form.changeTypes.length > 0 && form.changeTypes.length < CHANGE_TYPES.length
      ? CHANGE_TYPES.filter((t) => form.changeTypes.includes(t))
      : undefined,
  )
  assign("added_lines", form.addedLines || undefined)
  assign("ai", form.ai || undefined)

  const when: Record<string, unknown> = { ...(base?.when ?? {}) }
  if (form.forced === "yes") when.forced = true
  else delete when.forced
  assign("when", Object.keys(when).length > 0 ? when : undefined)

  if (form.changeTypes.length === 0) {
    return { success: false, error: "change_type: select at least one change type" }
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
