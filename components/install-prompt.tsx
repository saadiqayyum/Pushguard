import Image from "next/image"
import { ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"

function installUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG
  if (!raw) return null
  const slug = raw.split("/").filter(Boolean).pop()
  return slug ? `https://github.com/apps/${slug}/installations/new` : null
}

const STEPS = ["Install the app", "Pick repositories", "Alerts flow in"]

export function InstallPrompt() {
  const url = installUrl()
  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-8 text-center">
      <Image src="/logo.svg" alt="" width={56} height={56} priority />

      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Connect your GitHub account</h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          Install the Pushguard GitHub App on your account or organization and choose the
          repositories to watch. This dashboard activates on its own.
        </p>
      </div>

      {url ? (
        <Button asChild size="lg">
          <a href={url}>
            Install Pushguard on GitHub
            <ArrowUpRight className="size-4" />
          </a>
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          Ask the operator for the installation link (NEXT_PUBLIC_GITHUB_APP_SLUG is not set).
        </p>
      )}

      <ol className="flex items-center gap-2 text-xs text-muted-foreground">
        {STEPS.map((step, index) => (
          <li key={step} className="flex items-center gap-2">
            {index > 0 && <span aria-hidden className="text-border">—</span>}
            <span>
              <span className="font-medium text-foreground">{index + 1}.</span> {step}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
