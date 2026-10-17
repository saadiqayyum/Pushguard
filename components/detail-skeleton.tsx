import Link from "next/link"
import { ChevronLeft } from "lucide-react"

// The back link and page wrapper shared by detail pages; each loading.tsx supplies its own header and body.
export function DetailSkeleton({
  back,
  header,
  children,
}: {
  back: { href: string; label: string }
  header: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2">
        <Link href={back.href} className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ChevronLeft className="size-4" />
          {back.label}
        </Link>
        {header}
      </div>
      {children}
    </div>
  )
}
