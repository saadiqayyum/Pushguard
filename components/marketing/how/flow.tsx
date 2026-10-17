import { BellRing, ScanEye, Unplug, type LucideIcon } from "lucide-react"

const STEPS: { icon: LucideIcon; title: string; body: string; tone: string }[] = [
  {
    icon: Unplug,
    title: "Install on your GitHub account",
    body: "One install covers every repository in your account or organization, including the ones you add later.",
    tone: "bg-accent text-primary",
  },
  {
    icon: ScanEye,
    title: "Pushguard watches every change",
    body: "Each push is compared with patterns from real supply chain attacks. Suspicious changes can be checked in an isolated environment.",
    tone: "bg-[var(--ai-wash)] text-[var(--ai)]",
  },
  {
    icon: BellRing,
    title: "You get an alert",
    body: "A GitHub issue in the repository, saying what changed, who pushed it and why it matters. A copy can go to Slack or Discord.",
    tone: "bg-[var(--flag-wash)] text-[var(--flag)]",
  },
]

export function Flow() {
  return (
    <ol className="grid gap-4 md:grid-cols-3">
      {STEPS.map(({ icon: Icon, title, body, tone }, index) => (
        <li key={title} className="flex min-w-0 flex-col rounded-2xl border bg-card/80 p-5 shadow-sm backdrop-blur-sm sm:p-6">
          <div className="flex items-center justify-between">
            <span aria-hidden className={`inline-flex size-11 items-center justify-center rounded-xl ${tone}`}>
              <Icon className="size-5" strokeWidth={1.75} />
            </span>
            <span aria-hidden className="mono text-sm text-muted-foreground tabular-nums">
              0{index + 1}
            </span>
          </div>
          <h3 className="mt-5">{title}</h3>
          <p className="mt-2 leading-relaxed text-muted-foreground">{body}</p>
        </li>
      ))}
    </ol>
  )
}
