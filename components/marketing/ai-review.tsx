import { Gauge, KeyRound, ShieldCheck, Sparkles } from "lucide-react"
import type { HopVerdict, Investigation } from "@/lib/investigator-verdict"

const VERDICT_TONE: Record<HopVerdict, string> = {
  benign: "bg-[var(--add-wash)] text-[var(--add)]",
  unknown: "bg-muted text-muted-foreground",
  suspicious: "bg-[var(--warn-wash)] text-[var(--warn)]",
  malicious: "bg-[var(--flag-wash)] text-[var(--flag)]",
}


// Illustrative only: the paths and reasons are invented for the sample.
const HOPS: [string, HopVerdict, string][] = [
  ["lib/settings.js", "suspicious", "Collects every environment variable whose name ends in _TOKEN."],
  ["lib/encode.js", "suspicious", "Base64-encodes any value. Harmless alone, but its only caller wraps hop 1."],
  ["lib/metrics.js", "malicious", "Posts the encoded tokens to an outside host on every call."],
  ]

const SAMPLE: Investigation = {
  hops: HOPS.map(([path, verdict, reason], index) => ({ hop: index + 1, verdict, reason, evidence: [{ path, line: 1 }] })),
  overall: "malicious",
  summary: "Three commits by two authors build one path from environment secrets to the network.",
  reviewerDirected: [],
}

export function AiReview() {
  const facts = [
    { icon: KeyRound, text: "Works with an Anthropic, OpenAI or Google key. The key is stored encrypted." },
    { icon: Gauge, text: "You set how much it may spend each day." },
    { icon: ShieldCheck, text: "It can raise an alert, never hide one." },
  ]

  return (
    <div className="grid gap-8 rounded-3xl border border-[color-mix(in_oklch,var(--ai)_25%,var(--border))] bg-[var(--ai-wash)] p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-12">
      <div className="min-w-0">
        <span aria-hidden className="inline-flex size-11 items-center justify-center rounded-xl bg-background text-[var(--ai)]">
          <Sparkles className="size-5" strokeWidth={1.75} />
        </span>
        <h2 id="ai" className="mt-4">AI review on your own key</h2>
        <ul className="mt-6 flex flex-col gap-4">
          {facts.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3">
              <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--ai)]" strokeWidth={1.75} />
              <p className="leading-relaxed tabular-nums">{text}</p>
            </li>
          ))}
        </ul>
      </div>

      <figure className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="font-medium">AI verdict</span>
          <span className="text-xs text-muted-foreground">Sample</span>
        </figcaption>
        <ol className="mt-4 flex flex-col gap-3">
          {SAMPLE.hops.map((hop) => (
            <li key={hop.hop} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
              <span className="flex size-7 items-center justify-center rounded-full bg-muted text-sm font-medium tabular-nums">
                {hop.hop}
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <code className="mono text-[0.8125rem] break-all">
                    {hop.evidence[0]?.path}:{hop.evidence[0]?.line}
                  </code>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${VERDICT_TONE[hop.verdict]}`}>{hop.verdict}</span>
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{hop.reason}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4 text-sm">
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${VERDICT_TONE[SAMPLE.overall]}`}>{SAMPLE.overall}</span>
          {SAMPLE.summary}
        </p>
      </figure>
    </div>
  )
}
