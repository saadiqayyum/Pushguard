// The title row has a fixed height so pages with and without actions line up when switching tabs.
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight break-words">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {description && <div className="text-sm text-muted-foreground">{description}</div>}
    </div>
  )
}
