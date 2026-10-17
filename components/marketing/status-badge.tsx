import { CircleCheck, CircleDashed, Radio, type LucideIcon } from "lucide-react"
import type { AttackStatus } from "@/lib/marketing/parse"

export const STATUS_LABEL: Record<AttackStatus, string> = {
  confirmed: "Confirmed",
  reported: "Reported",
  possible: "Possible future",
}

const STYLE: Record<AttackStatus, { icon: LucideIcon; tone: string }> = {
  confirmed: { icon: CircleCheck, tone: "bg-[var(--add-wash)] text-[var(--add)]" },
  reported: { icon: Radio, tone: "bg-muted text-muted-foreground" },
  possible: { icon: CircleDashed, tone: "bg-[var(--ai-wash)] text-[var(--ai)]" },
}

export function StatusBadge({ status }: { status: AttackStatus }) {
  const { icon: Icon, tone } = STYLE[status]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      <Icon aria-hidden className="size-3.5" strokeWidth={2} />
      {STATUS_LABEL[status]}
    </span>
  )
}
