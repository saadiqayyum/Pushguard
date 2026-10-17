import { Bot, EyeOff, Layers, Package, Workflow, type LucideIcon } from "lucide-react"
import type { CategoryId } from "@/lib/marketing/categories"

const ICONS: Record<CategoryId, LucideIcon> = {
  packages: Package,
  "multi-stage": Layers,
  "ci-cd": Workflow,
  "hidden-code": EyeOff,
  ai: Bot,
}

// A tinted tile in the category's accent; the parent sets `data-cat`.
export function CategoryIcon({ category, size = "md" }: { category: CategoryId; size?: "sm" | "md" }) {
  const Icon = ICONS[category]
  return (
    <span
      aria-hidden
      className={
        size === "sm"
          ? "inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--cat-wash)] text-[var(--cat)]"
          : "inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--cat-wash)] text-[var(--cat)]"
      }
    >
      <Icon className={size === "sm" ? "size-4" : "size-5"} strokeWidth={1.75} />
    </span>
  )
}
