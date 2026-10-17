"use client"

import { useState } from "react"
import { ChevronRight, FlaskConical, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { api, ApiClientError } from "@/lib/api-client"
import { groupsOf } from "@/lib/rules/draft"
import type { Rule } from "@/schemas/rule"

type TestResult = { matched: boolean; matchedFiles: string[]; matchedLines: string[]; matchedMessages: string[] }

const FLAGS = [
  { flag: "forced", sample: "forced", label: "Force push" },
  { flag: "sender_first_push", sample: "senderFirstPush", label: "First push by sender" },
  { flag: "branch_created", sample: "branchCreated", label: "Branch created" },
  { flag: "branch_deleted", sample: "branchDeleted", label: "Branch deleted" },
  { flag: "author_mismatch", sample: "authorMismatch", label: "Author mismatch" },
  { flag: "unreviewed", sample: "unreviewed", label: "Not reviewed" },
] as const

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean)

export function TestPanel({ rule }: { rule?: Rule }) {
  const [files, setFiles] = useState("")
  const [diff, setDiff] = useState("")
  const [messages, setMessages] = useState("")
  const [flags, setFlags] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<TestResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const usedFlags = rule ? FLAGS.filter(({ flag }) => groupsOf(rule).some((g) => g.when?.[flag] !== undefined)) : []

  async function run() {
    if (!rule) return
    setBusy(true)
    setError(null)
    try {
      setResult(
        await api<TestResult>("/api/rules/test", {
          method: "POST",
          body: {
            rule,
            sample: {
              files: lines(files).map((path) => ({ path, changeType: "modified" })),
              diff: diff || undefined,
              commitMessages: lines(messages),
              ...Object.fromEntries(FLAGS.map(({ flag, sample }) => [sample, flags.has(flag)])),
            },
          },
        }),
      )
    } catch (cause) {
      setResult(null)
      setError(cause instanceof ApiClientError ? cause.message : "Test failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Collapsible className="rounded-lg border">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4">
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
        Test
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 border-t px-3 py-4 sm:px-4">
        <div className="space-y-2">
          <Label htmlFor="test-files">File paths</Label>
          <Textarea id="test-files" rows={2} value={files} onChange={(e) => setFiles(e.target.value)} placeholder="package.json" className="font-mono text-xs" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="test-diff">New code</Label>
          <Textarea id="test-diff" rows={4} value={diff} onChange={(e) => setDiff(e.target.value)} placeholder={'+  "postinstall": "node x.js"'} className="font-mono text-xs" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="test-messages">Commit messages</Label>
          <Textarea id="test-messages" rows={2} value={messages} onChange={(e) => setMessages(e.target.value)} className="font-mono text-xs" />
        </div>
        {usedFlags.length > 0 && (
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {usedFlags.map(({ flag, label }) => (
              <label key={flag} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={flags.has(flag)}
                  onCheckedChange={(on) => setFlags((prev) => (on ? new Set(prev).add(flag) : new Set([...prev].filter((f) => f !== flag))))}
                />
                {label}
              </label>
            ))}
          </div>
        )}
        <Button type="button" variant="outline" size="sm" onClick={run} disabled={!rule || busy} aria-busy={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <FlaskConical />}
          Run test
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {result && (
          <div role="status" className="space-y-2 rounded-md bg-muted/40 p-3 text-sm">
            <p className="font-medium">{result.matched ? "Matched" : "No match"}</p>
            {result.matchedFiles.length > 0 && <p className="text-xs break-all text-muted-foreground">{result.matchedFiles.join(", ")}</p>}
            {[...result.matchedLines, ...result.matchedMessages].length > 0 && (
              <pre className="max-h-40 overflow-auto rounded bg-background p-2 font-mono text-xs whitespace-pre-wrap break-all">
                {[...result.matchedLines, ...result.matchedMessages].join("\n")}
              </pre>
            )}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
