import { ChevronRight } from "lucide-react"
import { Bar } from "@/components/page-skeleton"
import { RulesToolbarPlaceholder } from "@/components/rules/rules-toolbar"
import { Skeleton } from "@/components/ui/skeleton"
import { PACKS } from "@/lib/rules/catalog"

const SECTIONS = [
  { title: "Custom", open: true, create: true },
  { title: "AI rules", open: true, create: true },
  ...PACKS.map((pack) => ({ title: pack.title, pack: true })),
]

// Mirrors RuleSection's row so the list does not move when the rules arrive.
function SectionRow({ title, open = false, pack = false, create = false }: { title: string; open?: boolean; pack?: boolean; create?: boolean }) {
  return (
    <div className="border-b last:border-b-0">
      <div className="flex items-center gap-3 px-3 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 py-3">
          <ChevronRight className={`size-4 shrink-0 text-muted-foreground ${open ? "rotate-90" : ""}`} />
          <span className="truncate text-sm font-medium">{title}</span>
          <Bar width="w-20" />
        </div>
        {pack && <Skeleton className="h-[1.15rem] w-8 rounded-full" />}
        {create && <span className="w-8" />}
      </div>
      {open && (
        <div className="pb-2">
          <Bar width="w-32" className="h-9 pl-9" />
        </div>
      )}
    </div>
  )
}

export default function RulesLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <RulesToolbarPlaceholder />
      <div className="rounded-lg border">
        {SECTIONS.map((section) => (
          <SectionRow key={section.title} {...section} />
        ))}
      </div>
    </div>
  )
}
