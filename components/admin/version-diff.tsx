import { diffLines } from "diff"
import { stringify } from "yaml"
import { cn } from "@/lib/utils"

export function VersionDiff({ before, after, label }: { before: unknown; after: unknown; label: string }) {
  const parts = diffLines(stringify(before ?? {}), stringify(after ?? {}))
  if (!parts.some((p) => p.added || p.removed)) return <p className="text-sm text-muted-foreground">No changes from {label}.</p>
  return (
    <pre className="max-h-[32rem] overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs leading-5" aria-label={`Changes from ${label}`}>
      {parts.flatMap((part, i) =>
        part.value
          .replace(/\n$/, "")
          .split("\n")
          .map((line, j) => (
            <div
              key={`${i}-${j}`}
              className={cn(part.added && "bg-primary/10 text-foreground", part.removed && "bg-destructive/10 text-destructive", !part.added && !part.removed && "text-muted-foreground")}
            >
              {part.added ? "+ " : part.removed ? "- " : "  "}
              {line}
            </div>
          )),
      )}
    </pre>
  )
}
