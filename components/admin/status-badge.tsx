import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  review: "bg-secondary text-secondary-foreground",
  shadow: "bg-secondary text-secondary-foreground",
  published: "bg-primary text-primary-foreground",
  internal: "bg-primary/10 text-foreground",
  retired: "bg-transparent text-muted-foreground line-through",
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("border-transparent", TONE[status] ?? TONE.draft)}>
      {status}
    </Badge>
  )
}
