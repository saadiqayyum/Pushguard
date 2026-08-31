import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Severity } from "@/schemas/rule"

// Severity, everywhere, in one ranking: solid for critical, tinted for high,.
const TONE: Record<Severity, string> = {
  critical: "bg-destructive text-white",
  high: "bg-destructive/10 text-destructive",
  medium: "bg-secondary text-secondary-foreground",
  low: "bg-muted text-muted-foreground",
}

export function SeverityBadge({
  severity,
  className,
}: {
  severity: Severity
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn("border-transparent", TONE[severity], className)}>
      {severity}
    </Badge>
  )
}
