import { Download, EyeOff, Globe, Hammer, KeyRound, Laptop, Server, Box, Workflow, type LucideIcon } from "lucide-react"
import type { SurfaceFamily } from "@/lib/marketing/parse"

// In the order of the numbered sections of docs/EXECUTION_SURFACES.md.
const ICONS: LucideIcon[] = [Laptop, Download, Hammer, Workflow, Server, Box, Globe, KeyRound, EyeOff]

export function SurfaceMap({ families }: { families: SurfaceFamily[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {families.map((family, index) => {
        const Icon = ICONS[index] ?? Box
        return (
          <li key={family.title} className="flex items-center gap-3 rounded-2xl border bg-card/80 p-4 shadow-sm backdrop-blur-sm">
            <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
              <Icon className="size-5" strokeWidth={1.75} />
            </span>
            <h3 className="min-w-0 flex-1 text-[1.0625rem]!">{family.title}</h3>
            <span className="text-muted-foreground tabular-nums">{family.count}</span>
          </li>
        )
      })}
    </ul>
  )
}
