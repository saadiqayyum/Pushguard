import { KeyRound, ListChecks, Send, Users } from "lucide-react"

const CARDS = [
  { icon: ListChecks, title: "Rules", body: "Ready-made rules are on from the start. Turn any of them off, or write your own." },
  { icon: KeyRound, title: "AI review", body: "Add your own Anthropic, OpenAI or Google key for a closer look at changes. You decide how much it can spend." },
  { icon: Send, title: "Where alerts go", body: "Alerts open as GitHub issues. Send a copy to Slack or Discord as well." },
  { icon: Users, title: "Who sees what", body: "Follows your GitHub roles. Owners change settings, and members see alerts for repositories they can already open." },
]

export function Controls() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {CARDS.map(({ icon: Icon, title, body }) => (
        <li key={title} className="flex min-w-0 gap-4 rounded-2xl border bg-card/80 p-5 shadow-sm backdrop-blur-sm">
          <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
            <Icon className="size-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[1.0625rem]!">{title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
