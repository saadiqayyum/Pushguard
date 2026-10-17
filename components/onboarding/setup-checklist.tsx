"use client"

import { useState } from "react"
import Link from "next/link"
import { CheckCircle2, Circle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { setupHiddenCookie } from "@/components/onboarding/setup-cookie"

// Dismissal lives in a cookie the server reads, so the card never pops in or out after hydration.
export function SetupChecklist({ org, sink, aiKey }: { org: string; sink: boolean; aiKey: boolean }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed || (sink && aiKey)) return null

  function dismiss() {
    document.cookie = `${setupHiddenCookie(org)}=1; path=/; max-age=31536000; samesite=lax`
    setDismissed(true)
  }

  const items = [
    { done: sink, label: "Send alerts to Slack or Discord", href: "/dashboard/settings", action: "Add destination" },
    { done: aiKey, label: "Add a model key for AI rules", href: "/dashboard/ai", action: "Add key" },
  ]

  return (
    <section aria-labelledby="setup-checklist-title" className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="setup-checklist-title" className="text-sm font-medium">
          Optional setup
        </h2>
        <Button variant="ghost" size="icon" className="size-8" onClick={dismiss} aria-label="Dismiss optional setup">
          <X className="size-4" />
        </Button>
      </div>
      <ul className="mt-2 divide-y">
        {items.map((item) => (
          <li key={item.href} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
            <span className="flex min-w-0 items-center gap-2.5 text-sm">
              {item.done ? (
                <CheckCircle2 className="size-4 shrink-0 text-primary" aria-label="Done" />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground" aria-label="Not done" />
              )}
              <span className={item.done ? "text-muted-foreground line-through" : undefined}>{item.label}</span>
            </span>
            {!item.done && (
              <Button asChild variant="outline" size="sm">
                <Link href={item.href}>{item.action}</Link>
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
