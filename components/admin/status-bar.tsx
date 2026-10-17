import { ChevronRight } from "lucide-react"
import { TransitionControls } from "@/components/admin/transition-controls"
import type { Status } from "@/lib/platform/lifecycle"
import { cn } from "@/lib/utils"

const STEPS: Status[] = ["draft", "review", "shadow", "published"]

export function StatusBar({ id, version, status, meta }: { id: string; version: number; status: Status; meta: string }) {
  const steps = STEPS.includes(status) ? STEPS : [...STEPS.slice(0, 3), status]
  return (
    <div className="flex max-w-2xl flex-col gap-3 rounded-lg border p-4 sm:px-6">
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="mr-2 font-medium tabular-nums">v{version}</span>
        {steps.map((step, i) => (
          <span key={step} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />}
            <span
              aria-current={step === status ? "step" : undefined}
              className={cn("rounded-md px-2 py-0.5 capitalize", step === status ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
            >
              {step}
            </span>
          </span>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">{meta}</span>
      </div>
      <TransitionControls kind="rule" id={id} version={version} status={status} />
    </div>
  )
}
