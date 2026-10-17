"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, ApiClientError } from "@/lib/api-client"

export function ContributorForm({ docs, maxText, maxUrls }: { docs: string[]; maxText: number; maxUrls: number }) {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [text, setText] = useState("")
  const [urls, setUrls] = useState("")
  const [doc, setDoc] = useState("")
  const [busy, setBusy] = useState(false)
  const urlList = urls.split(/\s+/).filter(Boolean)

  async function submit(body: Record<string, unknown>) {
    setBusy(true)
    try {
      await api("/api/admin/contributor", { method: "POST", body })
      toast.success("Queued. The draft appears here when it is ready.")
      setTitle("")
      setText("")
      setUrls("")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Could not queue")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Tabs defaultValue="incident" className="rounded-md border p-4">
      <TabsList>
        <TabsTrigger value="incident">Incident report</TabsTrigger>
        <TabsTrigger value="doc">Attack library</TabsTrigger>
      </TabsList>
      <TabsContent value="incident" className="space-y-3 pt-3">
        <div className="space-y-1.5">
          <Label htmlFor="ci-title">Title</Label>
          <Input id="ci-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ci-text">Report</Label>
          <Textarea id="ci-text" rows={10} value={text} onChange={(e) => setText(e.target.value)} maxLength={maxText} aria-describedby="ci-text-count" />
          <p id="ci-text-count" className="text-xs text-muted-foreground">
            {text.length.toLocaleString()} / {maxText.toLocaleString()}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ci-urls">Source URLs, one per line (up to {maxUrls})</Label>
          <Textarea id="ci-urls" rows={3} value={urls} onChange={(e) => setUrls(e.target.value)} className="font-mono text-xs" />
        </div>
        <Button
          disabled={busy || !title.trim() || !text.trim() || urlList.length > maxUrls}
          onClick={() => submit({ source: "incident", title, text, urls: urlList })}
        >
          {busy && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
          Draft a rule
        </Button>
      </TabsContent>
      <TabsContent value="doc" className="space-y-3 pt-3">
        <div className="space-y-1.5">
          <Label htmlFor="ci-doc">Attack</Label>
          <Select value={doc} onValueChange={setDoc}>
            <SelectTrigger id="ci-doc" className="w-full font-mono text-xs">
              <SelectValue placeholder={docs.length ? "Choose a file" : "No files found"} />
            </SelectTrigger>
            <SelectContent>
              {docs.map((d) => (
                <SelectItem key={d} value={d} className="font-mono text-xs">
                  {d.replace("docs/attacks/", "")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button disabled={busy || !doc} onClick={() => submit({ source: "doc", docPath: doc })}>
          {busy && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />}
          Draft a rule
        </Button>
      </TabsContent>
    </Tabs>
  )
}
